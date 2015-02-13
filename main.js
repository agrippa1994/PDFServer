var fs = require("fs");
var fdf = require("fdf");
var https = require("https");
var http = require("http");
var url = require("url");
var child_process = require("child_process");

// Configuration
var config = JSON.parse(fs.readFileSync("config.json"));

// The life time of a pdf file (default 60 seconds)
var PDF_LIFE_TIME = 60;

var INPUT_DIRECTORY = "input/";
var OUTPUT_DIRECTORY = "output/";
var PDF_DIRECTORY = "pdfs/";

var PORT = config["port"];
var ALLOWED_PDFS = config["allowed_pdfs"];

var KEY_PEM = null;
var CERT_PEM = null;

var USE_HTTPS = config["use_https"];
if(USE_HTTPS) {
	KEY_PEM = fs.readFileSync(config["https"]["key"]);
	CERT_PEM = fs.readFileSync(config["https"]["cert"]);
}

//	PDF files which are held by the webserver
//	Every object must have following properties:
//		id 				- Unique id of the object
// 		creationTime	- Time when the object has been created (seconds since 1970)
//		fdfPath			- Path, where the fdf file is located
//		inputPdfPath	- Path, where the input pdf (which will be filled) is stored
//		outputPdfPath	- Path, where the generated pdf is stored
//		pathForHTTP		- Path, which is for the Request to avoid access to files, which should not be accessed!
var currentPDFFiles = [{}];

// Measures the number of seconds since 1970 to now
function secondsAfter1970() {
	return Math.round(new Date().getTime() / 1000);
}

// Create a unique id
function unique_id() {
	if(typeof unique_id.stored_ids === "undefined") {
		unique_id.stored_ids = [];
	}

	if(typeof unique_id.generator === "undefined") {
		unique_id.generator = function(low, high) {
			return Math.floor(Math.random() * (high - low) + low);
		}
	}

	if(typeof unique_id.generate_string === "undefined") {
		unique_id.generate_string = function() {
			var str = "";
			for(var i = 0; i < 16; i++) 
				str += String.fromCharCode(unique_id.generator(0x61, 0x7A));

			return str;
		}
	}

	if(typeof unique_id.generate_unique_string === "undefined") {
		unique_id.generate_unique_string = function() {
			while(true) {
				var str = unique_id.generate_string();
				var found = false;

				for(var i = 0; i < unique_id.stored_ids; i++)
					if(str == unique_id.stored_ids[i])
						found = true;

				if(!found)
					return str;
			}
		}
	}

	return unique_id.generate_unique_string();
}

// Delete all files in the input and output directory
(function() {
	[OUTPUT_DIRECTORY, INPUT_DIRECTORY].forEach(function(dirName) {
		fs.readdir(dirName, function(error, files) {
			if(error === null) {
				files.forEach(function(file) {
					fs.unlink(dirName + file, function() { });
				});
			} else {
				console.log("Directory can not be cleaned!");
			}
		});
	});
})();

// HTTP connection handling
function httpConnectionHandler(request, response) {
	var path = url.parse(request.url).pathname;

	response.setHeader("Access-Control-Allow-Origin", "*");
	response.setHeader("Access-Control-Allow-Headers", "x-requested-with");

	// create PDF
	if(path == "/") {
		var postData = "";
		request.on("data", function(chunk){
			postData += chunk;
		});

		request.on("end", function() {
			try {
				var obj = JSON.parse(postData);

				if(!("input" in obj && "fills" in obj))
					throw "Wrong json format";

				if(typeof obj.input !== "string" || typeof obj.fills !== "object")
					throw "Wrong json format";

				var isAllowedPDF = false;
				for(var i = 0; i < ALLOWED_PDFS.length; i++)
					if(obj.input == ALLOWED_PDFS[i])
						isAllowedPDF = true;

				if(!isAllowedPDF)
					throw "PDF is not allowed!";

				var id = unique_id();
				var pdfObject = {
					id: 			id,
					creationTime: 	secondsAfter1970(),
					fdfPath: 		INPUT_DIRECTORY + id + ".fdf",
					inputPdfPath: 	PDF_DIRECTORY + obj.input,
					outputPdfPath: 	OUTPUT_DIRECTORY + id + ".pdf",
					pathForHTTP: 	id + ".pdf"
				};

				currentPDFFiles.push(pdfObject);

				fillPDFForms(pdfObject.inputPdfPath, pdfObject.fdfPath, pdfObject.outputPdfPath, obj.fills, function(success, error_msg) {
					if(!success) {
						response.statusCode = 404;
						response.end(error_msg);
						return;
					}

					response.statusCode = 200;
					response.end(pdfObject.pathForHTTP);
				});	

			} catch(e) {
				console.log("An error occured while processing the post data: " + e);
				response.statusCode = 404;
				response.end("Error " + e);
			}
		});
	}

	// fetch PDF
	else {
		var filename = path.substr(1);
		var filepath = OUTPUT_DIRECTORY + filename;

		var isInQueue = false;
		for(var i = 0; i < currentPDFFiles.length; i++)
			if(currentPDFFiles[i].pathForHTTP == filename)
				isInQueue = true;
		
		if(!isInQueue) {
			response.statusCode = 404;
			response.end("File does not exists!");
			return;
		}

		fs.exists(filepath, function(exists){
			if(exists) {
				response.statusCode = 200;
				response.end(fs.readFileSync(filepath));
			} else {
				response.statusCode = 404;
				response.end("File does not exists!");
			}
		});
	}
}

var httpServer = null;
if(USE_HTTPS) {
	httpServer = new https.createServer({ key: KEY_PEM, cert: CERT_PEM }, httpConnectionHandler);
} else {
	httpServer = http.createServer(httpConnectionHandler);
}

httpServer.listen(config["port"]);


//	Timer which clean all fdf and pdf files after they died
setInterval(function() {
	for(var i = 0; i < currentPDFFiles.length; i++) {
		var pdfFile = currentPDFFiles[i];

		if((pdfFile.creationTime + PDF_LIFE_TIME) < secondsAfter1970()) {
			fs.unlink(pdfFile.outputPdfPath, function(error) { });
			currentPDFFiles.splice(i, 1);
			i--;
		}
	}
});

function fillPDFForms(sourceFile, fdfDestination, destinationFile, fieldValues, callback) {
	try {
		if(!fdf.createFDF(fdfDestination, fieldValues))
			return callback(false, "Can't create FDF file!");
	}
	catch(e) {
		return callback(false, e);
	}

	child_process.exec("pdftk " + sourceFile + " fill_form " + fdfDestination + " output " + destinationFile + " flatten", function (error, stdout, stderr) {
		if (error !== null) {
			return callback(false, "exec error " + error);
		} 

		fs.unlink(fdfDestination, function(err) {
			if (err) 
				return callback(false, "unlink error " + err);

			callback(true, "No error");
		});
	});
 }
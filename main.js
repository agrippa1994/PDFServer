var fs = require("fs"),
	https = require("https"),
	http = require("http"),
	url = require("url"),
	unique_id = require("./unique_id.js"),
	pdffiller = require("./pdffiller.js")
;

// Configuration
var config = JSON.parse(fs.readFileSync("config.json"));

// The life time of a pdf file (default 60 seconds)
var PDF_LIFE_TIME = config["pdf_lifetime"] || 60;

var INPUT_DIRECTORY = config["input_dir"] || "input/";
var OUTPUT_DIRECTORY = config["output_dir"] || "output/";
var PDF_DIRECTORY = config["pdf_dir"] || "pdfs/";

var PORT = config["port"] || null;
var ALLOWED_PDFS = config["allowed_pdfs"] || [];

var KEY_PEM = null;
var CERT_PEM = null;

var USE_HTTPS = config["use_https"] || false;

function isConfigurationValid() {
	if(PORT == null) {
		console.log("No port has been set in the configuration file!");
		return false;
	}

	if(USE_HTTPS) {
		var keyPEMPath = config["https"]["key"] || null;
		var certPEMPath = config["https"]["cert"] || null;

		if(keyPEMPath == null || certPEMPath == null) {
			console.log("The SSL key or cert certificate isn't set in the configuration file!");
			console.log("If you don't want to use HTTPS you will have to remove the key \"use_https\" in your configuration or set it to false!");
			return false;
		}

		if(!fs.existsSync(keyPEMPath) || !fs.existsSync(certPEMPath)) {
			console.log("The SSL key or cert certificate can not be opened!");
			console.log("If you don't want to use HTTPS you will have to remove the key \"use_https\" in your configuration or set it to false!");
			return false;
		}

		KEY_PEM = fs.readFileSync(config["https"]["key"]);
		CERT_PEM = fs.readFileSync(config["https"]["cert"]);
	}

	if(INPUT_DIRECTORY.slice(-1) != "/" || OUTPUT_DIRECTORY.slice(-1) != "/" || PDF_DIRECTORY.slice(-1) != "/") {
		console.log("All path information have to end with a trailing slash!");
		return false;
	}

	if(PDF_LIFE_TIME <= 0) {
		console.log("The PDF lifetime must be equal or greater than one second!");
		return false;
	}

	if(ALLOWED_PDFS.length == 0) {
		console.log("No PDF files are allowed to be processed by the server!");
		return false;
	}

	for(var i = 0; i < ALLOWED_PDFS.length; i++) {
		if(!fs.existsSync(PDF_DIRECTORY + ALLOWED_PDFS[i])) {
			console.log("The allowed PDF " + ALLOWED_PDFS[i] + " can not be found in the PDF directory!");
			return false;
		}
	}

	return true;
}

// Exit the process if the configuration is invalid
if(!isConfigurationValid())
	process.exit(0);

//	Delete all files in the input and output directory at startup
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


//	PDF files which are held by the webserver
//	Every object must have following properties:
//		id 				- Unique id of the object
//		creationTime	- Time when the object has been created (seconds since 1970)
//		fdfPath			- Path, where the fdf file is located
//		inputPdfPath	- Path, where the input pdf (which will be filled) is stored
//		outputPdfPath	- Path, where the generated pdf is stored
//		pathForHTTP		- Path, which is for the Request to avoid access to files, which should not be accessed!
var currentPDFFiles = [{}];

//	Measures the number of seconds since 1970 to now
function secondsAfter1970() {
	return Math.round(new Date().getTime() / 1000);
}

//	Start the HTTP or the HTTPS server (depends on the configuration)
(function(){

	//	Create a PDF file with the parameters provided via the HTTP / HTTPS JSON body
	function createPDFForConnection(postData, response) {
		try {
			var obj = JSON.parse(postData);

			if(!("input" in obj && "fills" in obj))
				throw "Wrong json format";

			if(typeof obj.input !== "string" || typeof obj.fills !== "object")
				throw "Wrong json data types";

			var isAllowedPDF = false;
			for(var i = 0; i < ALLOWED_PDFS.length; i++)
				if(obj.input == ALLOWED_PDFS[i])
					isAllowedPDF = true;

			if(!isAllowedPDF)
				throw "PDF is not allowed";

			var id = unique_id();
			var pdfObject = {
				id: 			id,
				creationTime: 	secondsAfter1970(),
				fdfPath: 		INPUT_DIRECTORY + id + ".fdf",
				inputPdfPath: 	PDF_DIRECTORY + obj.input,
				outputPdfPath: 	OUTPUT_DIRECTORY + id + ".pdf",
				pathForHTTP: 	id + ".pdf"
			};

			//	Add PDF file to the expiration and validation handler
			currentPDFFiles.push(pdfObject);

			//	Fill the PDF
			pdffiller(pdfObject.inputPdfPath, pdfObject.fdfPath, pdfObject.outputPdfPath, obj.fills, function(success, error_msg) {
				if(!success)
					return response.end(error_msg);

				response.statusCode = 200;
				response.end(pdfObject.pathForHTTP);
			});	

		} catch(e) {
			console.log("An error occured while processing the post data: " + e);
			response.end("Error " + e);
		}
	}

	//	Fetch PDF for a request and upload it via HTTP / HTTPS body
	function fetchPDFForConnection(pdf, response) {
		var filename = pdf;
		var filepath = OUTPUT_DIRECTORY + filename;

		var isInQueue = false;
		for(var i = 0; i < currentPDFFiles.length; i++)
			if(currentPDFFiles[i].pathForHTTP == filename)
				isInQueue = true;
		
		if(!isInQueue)
			return response.end("File does not exist");

		fs.exists(filepath, function(exists){
			if(!exists)
				return response.end("File does not exists!");

			response.statusCode = 200;
			response.end(fs.readFileSync(filepath));
		});
	}

	//	HTTP / HTTPS connection handling
	function httpConnectionHandler(request, response) {
		var path = url.parse(request.url).pathname;

		//	Allow HTTP / HTTPS CORS (Cross-Origin-Resource-Sharing)
		response.setHeader("Access-Control-Allow-Origin", "*");
		response.setHeader("Access-Control-Allow-Headers", "x-requested-with");

		response.statusCode = 404;

		//	Create PDF
		if(path == "/") {
			// Read POST HTTP / HTTPS body
			var postData = "";
			request.on("data", function(chunk){
				postData += chunk;
			});

			request.on("end", function() {
				createPDFForConnection(postData, response);
			});
		}
		//	Fetch PDF
		else {
			fetchPDFForConnection(path.substr(1), response);
		}
	}

	//	Start the HTTP / HTTPS server and listen for a request
	var httpServer = null;
	if(USE_HTTPS)
		httpServer = new https.createServer({ key: KEY_PEM, cert: CERT_PEM }, httpConnectionHandler);
	else 
		httpServer = http.createServer(httpConnectionHandler);

	httpServer.listen(PORT);
})();



//	Timer which clean all fdf and pdf files after they died
(function(){
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
})();



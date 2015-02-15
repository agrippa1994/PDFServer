var fdf = require("fdf"),
	fs = require("fs"),
	child_process = require("child_process")
;	

module.exports = function(sourceFile, fdfDestination, destinationFile, fieldValues, callback) {
	//	Create the FDF file for pdftk
	try {
		if(!fdf.createFDF(fdfDestination, fieldValues))
			return callback(false, "Can't create FDF file!");
	}
	catch(e) {
		return callback(false, e);
	}

	//	Execute pdftk with the given parameters
	child_process.exec("pdftk " + sourceFile + " fill_form " + fdfDestination + " output " + destinationFile, function (error, stdout, stderr) {
		if (error !== null)
			return callback(false, "exec error " + error);

		fs.unlink(fdfDestination, function(err) {
			if (err) 
				return callback(false, "unlink error " + err);

			callback(true, "No error");
		});
	});
}
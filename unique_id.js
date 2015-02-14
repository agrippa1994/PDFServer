//	Use this function as a storage for the unique ids
function unique_id() { }

//	Stored ids
unique_id.stored_ids = [];

//	Static function to generate a random number between low (inclusive) and high (inclusive)
unique_id.generator = function(low, high) {
	return Math.floor(Math.random() * (high - low + 1) + low);
}

//	Static function to generate a string
unique_id.generate_string = function() {
	var str = "";
	for(var i = 0; i < 32; i++) {
		switch(unique_id.generator(0,2)){
		case 0: //	ASCII 0 - 9
			str += String.fromCharCode(unique_id.generator(0x30, 0x39));
			break;
		case 1: //	ASCII A - Z
			str += String.fromCharCode(unique_id.generator(0x41, 0x5A));
			break;
		case 2: //	ASCII a - b
			str += String.fromCharCode(unique_id.generator(0x61, 0x7A));
			break;
		}
	}
	return str;
}

//	Static function to generate a unique string
unique_id.generate_unique_string = function() {
	while(true) {
		var str = unique_id.generate_string();
		var found = false;

		for(var i = 0; i < unique_id.stored_ids; i++)
			if(str == unique_id.stored_ids[i])
				found = true;

		if(!found)
		{
			unique_id.stored_ids.push(str);
			return str;
		}
	}
}

//	Static function to free an id from the stored ids
unique_id.free = function(id) {
	var idx = unique_id.stored_ids.indexOf(id);
	if(idx == -1)
		return false;

	return unique_id.stored_ids.splice(idx, 1).length != 0;
}

module.exports = {
	generate: unique_id.generate_unique_string,
	free : unique_id.free
};

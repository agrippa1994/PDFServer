// Use this function as a storage for the unique ids
function unique_id() { }

module.exports = {
	generate: function() {
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
					{
						unique_id.stored_ids.push(str);
						return str;
					}
				}
			}
		}
		return unique_id.generate_unique_string();
	},

	free: function(id) {
		if(typeof unique_id.stored_ids === "undefined") {
			unique_id.stored_ids = [];
		}

		var idx = unique_id.stored_ids.indexOf(id);
		if(idx == -1)
			return false;

		return unique_id.stored_ids.splice(idx, 1).length != 0;
	}
};



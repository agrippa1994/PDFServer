# PDFServer
A HTTP / HTTPS server which can fill form fields of a PDF file, written in NodeJS

Installation
===============
First of all you have to install my ![FDF module for NodeJS](https://github.com/agrippa1994/nodejs-fdf). After that you can configure the server via the file "config.json".

How can a PDF be filled?
==========================
Create a POST request to the PDF server with following content
```
{
  "input": "file.pdf",
  "fills": {
    "name_of_field": "Value of field"
  }
}
```

If this POST request succeed, the response status code will be 200 and the response's body will contain the relative path to the stored PDF file. This can be easily downloaded with a HTTP / HTTPS GET request. Otherwise, if the status code isn't 200, an error message will be contained in the response's body.

Example
-----------
The client sends a POST request to the PDF server with a JSON encoded body which contains all information for filling the PDF file. The server fills the PDF file and the server will send a body like this: "klgkuldjswgqngur.pdf". You can access this PDF file with a GET request. 

```
-- request --
POST http://localhost:8002/
Content-Type: application/json
{
  "input": "file.pdf",
  "fills": {
    "field": "Value of the field"
  }
}
 -- response --
200 OK
Access-Control-Allow-Origin:  *
Date:  Fri, 13 Feb 2015 17:06:35 GMT
Connection:  keep-alive
Transfer-Encoding:  chunked

klgkuldjswgqngur.pdf
```

The server has created the PDF successfully. Now, we can download it in a very convenient way.

```
-- request --
GET http://localhost:8002/klgkuldjswgqngur.pdf

 -- response --
200 OK
Content-Type:  application/pdf
Access-Control-Allow-Origin:  *
Date:  Fri, 13 Feb 2015 17:07:10 GMT
Connection:  keep-alive
Transfer-Encoding:  chunked

%PDF-1.6
....
```

HTML and JavaScript example using jQuery
----------------------------------------
```
<p>Name</p><input id="name"></br>
<p>Address</p><input id="address"></br>
<button id="onOK">button</button>

<script type="text/javascript">
	function loadPDF(url, postData) {
		jQuery.post(
			url,
			postData,
			function(data) {
				if(textStatus ==)
				window.open("http://localhost:8002/" + data);
			}
		);
	}

	$("#onOK").click(function() {
		loadPDF("http://localhost:8002/", 
			JSON.stringify(
				{
					input: "file.pdf", 
					fills:
					{
						name: $("#name").val(),
						address: $("#address").val()
					}
				}
			)
		);
	});

</script>
```

// Copyright 2018 Leaning Technologies Ltd
var controlPort = null;
var packagePromise = null;
var extensionUrlPrefix = null;
if(location.protocol == "chrome-extension:")
{
	packagePromise = new Promise(function(s, e)
	{
		chrome.runtime.getPackageDirectoryEntry(s);
	});
	extensionUrlPrefix = "chrome-extension://" + chrome.runtime.id + "/";
}
function wrapInPromise(o, f)
{
	var args = [].splice.call(arguments, 2);
	return new Promise(function(s, e)
	{
		args.push(s);
		args.push(e);
		f.apply(o, args);
	});
}
async function handlePackageRequest(d)
{
	var filePath = d.url.substr(extensionUrlPrefix.length);
	try
	{
		var packageEntry = await packagePromise;
		var r = await wrapInPromise(packageEntry, packageEntry.getFile, filePath, null);
		if(r.isFile)
		{
			var m = await wrapInPromise(r, r.getMetadata);
			if(d.metaDataOnly == false)
			{
				var f = await wrapInPromise(r, r.file);
				// TODO: Streaming support
				var a = await f.arrayBuffer();
				// In the accumulate case we need to send the chunk at the end
				var b = new Uint8Array(a);
				if(d.rangeHeader !== null)
				{
					// Skip "bytes="
					var r = d.rangeHeader.substr(6);
					var s = r.split("-");
					var startByte = parseInt(s[0]);
					var endByte = parseInt(s[1]);
					b = b.subarray(startByte, endByte + 1);
				}
				if(d.chunkSize == 0)
				{
					controlPort.postMessage({url: d.url, responseURL: d.url, fileLength: m.size, idx: d.idx, from: "onEnd", resp: [b]}, [b.buffer]);
				}
				else
				{
					for(var i=0;i<b.length;i+=d.chunkSize)
					{
						var chunkSize = d.chunkSize;
						var availSize = b.length - i;
						if(chunkSize > availSize)
							chunkSize = availSize;
						var chunk = new Uint8Array(b.subarray(i, i+chunkSize));
						controlPort.postMessage({url: d.url, responseURL: d.url, fileLength: m.size, idx: d.idx, from: "onData", resp: chunk}, [chunk.buffer]);
					}
					controlPort.postMessage({url: d.url, responseURL: d.url, fileLength: m.size, idx: d.idx, from: "onEnd", resp: null});
				}
			}
			else if(d.metaDataOnly == true)
			{
				// It is ok not to send any data
				controlPort.postMessage({url: d.url, responseURL: d.url, fileLength: m.size, idx: d.idx, from: "onEnd", resp: null});
			}
			else
			{
				debugger;
			}
		}
		else if(r.isDirectory)
		{
			debugger;
		}
		else
		{
			debugger;
		}
	}
	catch(e)
	{
		if(e.message == "A requested file or directory could not be found at the time an operation was processed.")
		{
			// File not found
			controlPort.postMessage({url: d.url, responseURL: d.url, fileLength: -1, idx: d.idx, from: "onEnd", resp: null});
		}
		else if(e.message == "The path supplied exists, but was not an entry of requested type.")
		{
			// A directory
			var responseURL = d.url + "/";
			controlPort.postMessage({url: d.url, responseURL: responseURL, fileLength: 0, idx: d.idx, from: "onEnd", resp: null});
		}
		else if(e.message == "The requested file could not be read, typically due to permission problems that have occurred after a reference to a file was acquired.")
		{
			// Try again, chrome access error
			handlePackageRequest(d);
		}
		else
		{
			console.log("Error for", d.url);
			debugger;
		}
	}
}
function handleMessage(e)
{
	var d = e.data;
	switch(d.t)
	{
		case "port":
			controlPort = d.port;
			window.removeEventListener("message", handleMessage);
			controlPort.onmessage = handleMessage;
			break;
		case "load":
			if(extensionUrlPrefix !== null && d.url.startsWith(extensionUrlPrefix))
			{
				handlePackageRequest(d);
				break;
			}
			var dl = new DirectDownloader(d.url, d.metaDataOnly, d.chunkSize, d.rangeHeader);
			dl.onData = function(resp)
			{
				controlPort.postMessage({url: this.url, responseURL: this.responseURL, fileLength: this.fileLength, idx: d.idx, from: "onData", resp: resp});
			};
			dl.onEnd = function(resp)
			{
				controlPort.postMessage({url: this.url, responseURL: this.responseURL, fileLength: this.fileLength, idx: d.idx, from: "onEnd", resp: resp});
			};
			dl.send();
			break;
		default:
			debugger;
	}
}
window.addEventListener("message", handleMessage);

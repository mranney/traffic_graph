var node = {
        http: require('http'),
        sys: require('sys'),
        url: require('url'),
        fs: require('fs'),
        path: require('path'),
        pcap: require('pcap')
    },
    http_server, ws_server, ws_waiters = [];

function upgrade_client(request, socket, head) {
    console.log(request.connection.remoteAddress + " WebSocket upgrade.");

    try {
        socket.write([
            'HTTP/1.1 101 Web Socket Protocol Handshake',
            'Upgrade: WebSocket',
            'Connection: Upgrade',
            'WebSocket-Origin: ' + request.headers.origin,
            'WebSocket-Location: ws://' + request.headers.host + request.url,
            '',
            ''
        ].join('\r\n'), 'utf8');

        ws_waiters.push(socket);
    }
    catch (err) {
        sys.puts("Exception in upgrade handler: " + err.stack);
    }

    socket.on('data', function (chunk) {
        try {
            console.log("Got WS chunk: " + chunk.toString('utf8', 1, (chunk.length - 1)));
        } catch (err) {
            console.log("Exception in data chunk handler: " + err.stack);
            socket.end();
        }
    });

    socket.on('end', function (err) {
        var socket_pos = ws_waiters.indexOf(socket);
        console.log("Got WebSocket end: " + err);
        socket.end();
        if (socket_pos > -1) {
            ws_waiters.splice(socket_pos, 1);
        } else {
            console.log("WebSocket end: Couldn't find socket in list");
        }
    });
}

function lookup_mime_type(file_name) {
    var mime_types = {
            html: "text/html",
            txt: "text/plain",
            js: "application/javascript",
            css: "text/css",
            ico: "image/x-icon"
        },
        index = file_name.lastIndexOf('.'),
        suffix;

    if (index > 0 && index < (file_name.length - 2)) {
        suffix = file_name.substring(index + 1);
        if (mime_types[suffix] !== undefined) {
            return mime_types[suffix];
        }
    }
    return "text/plain";
}

function do_error(res, code, message) {
    res.writeHead(code, {
        "Content-Type": "text/plain"
    });
    res.write(JSON.stringify({
        code: code,
        error: message
    }));
    res.end();
}

function handle_file(filename, req, res) {
    var local_name = filename.replace(/^\//, __dirname + "/");

    if (local_name.match(/\/$/)) {
        local_name += "index.html";
    }

    node.path.exists(local_name, function (exists) {
        if (exists) {
            var file = node.fs.readFile(local_name, function (err, data) {
                var out_headers = {
                    "Content-Type": lookup_mime_type(local_name),
                    "Content-Length": data.length
                };
                if (err) {
                    do_error(res, 500, "Error opening " + local_name + ": " + err);
                    return;
                }
                if (req.headers.origin) {
                    out_headers["access-control-allow-origin"] = req.headers.origin;
                }
                res.writeHead(200, out_headers);
                console.log(req.connection.remoteAddress + " GET " + filename + " 200 " + data.length);
                res.write(data);
                res.end();
            });
        } else {
            do_error(res, 404, local_name + " does not exist");
        }
    });
}

function handle_get(req, res) {
    try {
        var url_parsed = node.url.parse(req.url, true),
            pathname = url_parsed.pathname;

        switch (url_parsed.pathname) {
        case "/":
        case "/index.html":
        case "/grapher.js":
        case "/favicon.ico":
        case "/raphael-min.js":
            handle_file(url_parsed.pathname, req, res);
            break;
        default:
            do_error(res, 404, "URL " + url_parsed.pathname + " not found");
        }
    } catch (err) {
        do_error(res, 500, "Internal Server Error: " + err.stack);
    }
}

function new_client(req, res) {
    if (req.method === "GET") {
        handle_get(req, res);
    } else {
        do_error(res, 400, "Bad request");
    }
}

server = node.http.createServer(new_client);
server.on('upgrade', upgrade_client);
server.on('listening', function () {
    console.log("Listening for requests");
});
server.listen(80);

var pcap_session = node.pcap.createSession("en1", "");

pcap_session.addListener('packet', function (raw_packet) {
    var packet = node.pcap.decode.packet(raw_packet);
    if (packet.link.ip) {
        ws_waiters.forEach(function (socket) {
            console.log("Sending post to WS waiter " + socket.remoteAddress + ":" + socket.remotePort);
            socket.write('\u0000', 'binary');
            socket.write(JSON.stringify(packet.link.ip), 'utf8');
            socket.write('\uffff', 'binary');
        });
    }
});

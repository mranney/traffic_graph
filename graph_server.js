var node = {
        http: require('http'),
        sys: require('sys'),
        url: require('url'),
        fs: require('fs'),
        path: require('path'),
        crypto: require('crypto'),
        pcap: require('pcap')
    },
    ws_start_byte, ws_stop_byte, ws_server, ws_waiters = [],
    pcap_session, tcp_tracker, http_server;

function upgrade_client(request, socket, key_3) {
    try {
        if (request.headers["sec-websocket-key1"]) {
            // http://tools.ietf.org/html/draft-hixie-thewebsocketprotocol-76#section-5
            var key_number_1, key_number_2, spaces_1, spaces_2, part_1, part_2, hash, challenge, response;
            key_number_1 = parseInt(request.headers["sec-websocket-key1"].replace(/[^\d]/g, ""), 10);
            key_number_2 = parseInt(request.headers["sec-websocket-key2"].replace(/[^\d]/g, ""), 10);
            spaces_1 = request.headers["sec-websocket-key1"].replace(/[^\s]/g, "").length;
            spaces_2 = request.headers["sec-websocket-key2"].replace(/[^\s]/g, "").length;

            if (spaces_1 === 0) {
                throw new Error("spaces_1 is 0");
            } else if (spaces_2 === 0) {
                throw new Error("spaces_2 is 0");
            } else if (key_number_1 % spaces_1 != 0) {
                throw new Error("key_number_1 is not an intergral multiple of spaces_1");
            } else if (key_number_2 % spaces_2 != 0) {
                throw new Error("key_number_2 is not an intergral multiple of spaces_2");
            }

            part_1 = key_number_1 / spaces_1;
            part_2 = key_number_2 / spaces_2;

            challenge = new Buffer(16);
            challenge[0] = (part_1 >> 24) & 0xff;
            challenge[1] = (part_1 >> 16) & 0xff;
            challenge[2] = (part_1 >> 8) & 0xff;
            challenge[3] = part_1 & 0xff;
            challenge[4] = (part_2 >> 24) & 0xff;
            challenge[5] = (part_2 >> 16) & 0xff;
            challenge[6] = (part_2 >> 8) & 0xff;
            challenge[7] = part_2 & 0xff;
            key_3.copy(challenge, 8, 0);

            hash = node.crypto.createHash("md5");
            hash.update(challenge);
            response = hash.digest("binary"); // ouch - no way to return a Buffer from hash.digest?

            socket.write([
                'HTTP/1.1 101 WebSocket Protocol Handshake',
                'Upgrade: WebSocket',
                'Connection: Upgrade',
                'Sec-WebSocket-Origin: ' + request.headers.origin,
                'Sec-WebSocket-Location: ws://' + request.headers.host + request.url,
                '',
                ''
            ].join('\r\n'), 'utf8');
            socket.write(response, "binary"); // change this when hash can return a Buffer
        } else { // draft75 I guess
            socket.write([
                'HTTP/1.1 101 Web Socket Protocol Handshake',
                'Upgrade: WebSocket',
                'Connection: Upgrade',
                'WebSocket-Origin: ' + request.headers.origin,
                'WebSocket-Location: ws://' + request.headers.host + request.url,
                '',
                ''
            ].join('\r\n'), 'utf8');
        }

        socket.setTimeout(60 * 60 * 1000); // allow WS sockets to hang out for an hour
        console.log(request.connection.remoteAddress + " WebSocket upgrade");
        ws_waiters.push(socket);
    } catch (err) {
        socket.end();
        console.log(request.connection.remoteAddress + " WebSocket upgrade error " + err);
    }

    socket.on('data', function (chunk) {
        try {
            console.log("Got WS chunk: " + chunk.toString('utf8', 1, (chunk.length - 1)));
        } catch (err) {
            console.log("Exception in data chunk handler: " + err.stack);
            cleanup_socket(socket);
        }
    });

    socket.on('close', function (err) {
        console.log("Got WebSocket close: " + err);
        cleanup_socket(socket);
    });

    socket.on('end', function (err) {
        console.log("Got WebSocket end: " + err);
        cleanup_socket(socket);
    });
}

function cleanup_socket(socket) {
    var socket_pos = ws_waiters.indexOf(socket);
    socket.end();
    if (socket_pos > -1) {
        ws_waiters.splice(socket_pos, 1);
    }
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

ws_stop_byte = new Buffer(1);
ws_stop_byte[0] = 255;
ws_start_byte = new Buffer(1);
ws_start_byte[0] = 0;

function send_to_waiters(obj) {
    var str;
    
    if (ws_waiters.length > 0) {
        str = JSON.stringify(obj);
        console.log("Sending to " + ws_waiters.length + " waiters: " + str);

        ws_waiters.forEach(function (socket) {
            try {
                socket.write(ws_start_byte);
                socket.write(str, 'utf8');
                socket.write(ws_stop_byte);
            } catch (err) {
                console.log("socket write error, need to remove from list somehow: " + err);
            }
        });
    }
}

server = node.http.createServer(new_client);
server.on('upgrade', upgrade_client);
server.on('listening', function () {
    console.log("Listening for requests");
});
server.listen(80);

pcap_session = node.pcap.createSession(process.argv[2], process.argv[3]);
tcp_tracker = new node.pcap.TCP_tracker();

tcp_tracker.on('reverse', function (name, value) {
    if (value) {
        send_to_waiters({
            event: "reverse map",
            name: name,
            value: value
        });
    } else {
        console.log("reverse event for " + name + " with no value");
    }
});

tcp_tracker.on('http request', function (session, http) {
    if (session.http_request_count) {
        session.http_request_count += 1;
    } else {
        session.http_request_count = 1;
    }
    
    send_to_waiters({
        event: "http request",
        key: session.key,
        method: http.request.method,
        url: http.request.url,
        headers: http.request.headers
    });
});

tcp_tracker.on('http request complete', function (session, http, data) {
    send_to_waiters({
        event: "http request complete",
        key: session.key,
        body_len: http.request.body_len
    });
});

tcp_tracker.on('http response', function (session, http) {
    send_to_waiters({
        event: "http response",
        key: session.key,
        status_code: http.response.status_code,
        headers: http.response.headers
    });
});

tcp_tracker.on('http response body', function (session, http, data) {
    send_to_waiters({
        event: "http response body",
        key: session.key,
        data_length: data.length
    });
});

tcp_tracker.on('http response complete', function (session, http, data) {
    send_to_waiters({
        event: "http response complete",
        key: session.key,
        body_len: http.response.body_len
    });
});

tcp_tracker.on('websocket upgrade', function (session, http) {
    send_to_waiters({
        event: "websocket upgrade",
        key: session.key,
        headers: http.response.headers
    });
});

tcp_tracker.on('websocket message', function (session, dir, message) {
    // var message_obj = JSON.parse(message), key_parts, new_message;
    // 
    // console.log("considering: " + message);
    // 
    // if (message_obj.key) {
    //     key_parts = message_obj.key.split('-', 2);
    // }
    // 
    // new_message = JSON.stringify({
    //     event: "websocket_message",
    //     key: session.key,
    //     data_length: message.length
    // });
    // 
    // ws_waiters.forEach(function (socket) {
    //     var from_addr = socket.remoteAddress + ":" + socket.remotePort;
    //     if ( !key_parts || (from_addr !== key_parts[0])) {
    //         console.log("Sending to " + from_addr + ": " + new_message);
    //         socket.write(ws_start_byte);
    //         socket.write(new_message, 'utf8');
    //         socket.write(ws_stop_byte);
    //     } else {
    //         console.log("Skipping WS message to self");
    //     }
    // });
});

// listen for packets, decode them, and feed TCP to the tracker
pcap_session.on('packet', function (raw_packet) {
    var packet = node.pcap.decode.packet(raw_packet);

    tcp_tracker.track_packet(packet);
});

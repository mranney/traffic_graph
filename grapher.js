/*global WebSocket window */
"use strict";

var log_elem = document.getElementById('log'), socket,
    dns_cache = {}, sessions = {}, status_lookup;

if (typeof WebSocket === 'object') {
    log_elem.innerText = "Connecting to WebSocket server...";
    socket = new WebSocket("ws://" + window.location.host);
} else {
    alert("No WebSocket support in this browser, sorry.");
}
    
status_lookup = (function () {
    // from node.js, lib/http.js
    var STATUS_CODES = {
      100 : 'Continue',
      101 : 'Switching Protocols',
      102 : 'Processing',                 // RFC 2518, obsoleted by RFC 4918
      200 : 'OK',
      201 : 'Created',
      202 : 'Accepted',
      203 : 'Non-Authoritative Information',
      204 : 'No Content',
      205 : 'Reset Content',
      206 : 'Partial Content',
      207 : 'Multi-Status',               // RFC 4918
      300 : 'Multiple Choices',
      301 : 'Moved Permanently',
      302 : 'Moved Temporarily',
      303 : 'See Other',
      304 : 'Not Modified',
      305 : 'Use Proxy',
      307 : 'Temporary Redirect',
      400 : 'Bad Request',
      401 : 'Unauthorized',
      402 : 'Payment Required',
      403 : 'Forbidden',
      404 : 'Not Found',
      405 : 'Method Not Allowed',
      406 : 'Not Acceptable',
      407 : 'Proxy Authentication Required',
      408 : 'Request Time-out',
      409 : 'Conflict',
      410 : 'Gone',
      411 : 'Length Required',
      412 : 'Precondition Failed',
      413 : 'Request Entity Too Large',
      414 : 'Request-URI Too Large',
      415 : 'Unsupported Media Type',
      416 : 'Requested Range Not Satisfiable',
      417 : 'Expectation Failed',
      418 : 'I\'m a teapot',              // RFC 2324
      422 : 'Unprocessable Entity',       // RFC 4918
      423 : 'Locked',                     // RFC 4918
      424 : 'Failed Dependency',          // RFC 4918
      425 : 'Unordered Collection',       // RFC 4918
      426 : 'Upgrade Required',           // RFC 2817
      500 : 'Internal Server Error',
      501 : 'Not Implemented',
      502 : 'Bad Gateway',
      503 : 'Service Unavailable',
      504 : 'Gateway Time-out',
      505 : 'HTTP Version not supported',
      506 : 'Variant Also Negotiates',    // RFC 2295
      507 : 'Insufficient Storage',       // RFC 4918
      509 : 'Bandwidth Limit Exceeded',
      510 : 'Not Extended'                // RFC 2774
    };

    return function (code) {
        return STATUS_CODES[code];
    };
})();

function parse_key(key) {
    var addr_pairs = key.split('-', 2);
    return {
        src: addr_pairs[0],
        dst: addr_pairs[1]
    };
}

function update_response_body(obj) {
    var session = sessions[obj.key];

    if (session === undefined) {
        console.log("Couldn't find session in obj " + obj.key);
    } else {
        session.elem.innerHTML += "<span class=\"body_chunk\">" + obj.data_length + "B<span>";
    }
}

function dns_lookup(addr) {
    var parts = addr.split(':', 2);
    if (dns_cache[parts[0]]) {
        return dns_cache[parts[0]] + ":" + parts[1];
    }
    return null;
}

function new_request(obj) {
    var addrs = parse_key(obj.key), requests, session_elem, session, tmp, new_request_elem, row, col1, col2;

    if (! sessions[obj.key]) {
        session_elem = document.createElement('table');
        session_elem.className = "session";
        row = session_elem.insertRow(0);
        col1 = row.insertCell(0);
        col2 = row.insertCell(1);
        col1.className = "src_col";
        col1.innerHTML = dns_lookup(addrs.src) || addrs.src;
        col2.className = "req_col";
        tmp = document.getElementById('sessions');
        tmp.insertBefore(session_elem, tmp.firstChild);
        sessions[obj.key] = {
            requests: [],
            request_container: col2
        };
    }
    session = sessions[obj.key];

    new_request_elem = document.createElement('div');
    new_request_elem.className = "request start";
    new_request_elem.innerHTML = '<div class="url">' + obj.method + " " + obj.url + '</div>' +
        '<div class="headers">Host: ' + obj.headers["Host"] + '</div>' +
        '<div class="headers">' + (obj.headers["User-Agent"] || obj.headers.Upgrade || "") + '</div>';

    session.request_container.appendChild(new_request_elem);
    
    session.requests.push({
        url: obj.url,
        method: obj.method,
        req_headers: obj.headers,
        elem: new_request_elem
    });
}

function request_complete(obj) {
    var addrs = parse_key(obj.key),
        session = sessions[obj.key], elem;

    if (typeof session !== 'object') {
        console.log("Couldn't find session " + obj.key + " in list, ignoring.");
        return;
    }

    elem = session.requests[session.requests.length - 1].elem;
    if (! elem) {
        console.log("missing elem for " + obj.key);
        return;
    }
    elem.className = "request sent";
}

function response_start(obj) {
    var session = sessions[obj.key],
        request = session.requests[session.requests.length - 1];

    if (typeof session !== 'object') {
        console.log("Couldn't find session " + obj.key + " in list, ignoring.");
        return;
    }

    request.elem.innerHTML += '<div class="response_code">' + obj.status_code + " " + status_lookup(obj.status_code) + '</div>';
    if (obj.status_code === 304 || obj.status_code == 204 || obj.status_code === 302 || request.method === "HEAD") {
        request.elem.className = "request";
        request.response_bytes = 0;
        request.response_elem = document.createElement('DIV');
        request.response_elem.className = "response_status";
        request.response_elem.innerText = "No body";
    } else {
        request.elem.className = "response start";
        request.response_bytes = 0;
        request.response_elem = document.createElement('DIV');
        request.response_elem.className = "response_status";
        request.response_elem.innerText = "0 Bytes starting";
    }
    request.elem.appendChild(request.response_elem);
}

function response_body_chunk(obj) {
    var session = sessions[obj.key],
        request = session.requests[session.requests.length - 1];

    if (typeof session !== 'object') {
        console.log("Couldn't find session " + obj.key + " in list, ignoring.");
        return;
    }

    request.elem.className = "response data";
    request.response_bytes += obj.data_length;
    if (request.response_elem) {
        request.response_elem.innerText = request.response_bytes + " Bytes so far";
    }
}

function response_complete(obj) {
    var session = sessions[obj.key],
        request = session.requests[session.requests.length - 1];

    if (typeof session !== 'object') {
        console.log("Couldn't find session " + obj.key + " in list, ignoring.");
        return;
    }

    request.elem.className = "response";
    request.response_bytes = obj.body_len;
    if (request.response_elem) {
        request.response_elem.innerText = request.response_bytes + " Bytes complete";
    }
}

function reverse_map(obj) {
    dns_cache[obj.name] = obj.value;
    console.log("Adding " + obj.name + " to dns cache: " + obj.value);
}

function websocket_start(obj) {
    var addrs = parse_key(obj.key),
        session = sessions[obj.key], elem, response_elem;

    if (typeof session !== 'object') {
        console.log("Couldn't find session " + obj.key + " in list, ignoring.");
        return;
    }

    elem = session.requests[session.requests.length - 1].elem;
    if (! elem) {
        console.log("missing elem for " + obj.key);
        return;
    }

    session.requests[session.requests.length - 1].elem.className = "request";

    response_elem = document.createElement('div');
    response_elem.className = "websocket start";
    response_elem.innerHTML = "WebSocket handshake";

    session.requests[session.requests.length - 1].elem.parentElement.appendChild(response_elem);
}

if (socket) {
    socket.addEventListener('open', function (event) {
        console.log("WS open");
        log_elem.style.background = "rgb(128,255,128)";
        log_elem.innerText = 'WebSocket Connected';
    });

    socket.addEventListener('message', function (event) {
        var obj;

        try {
            obj = JSON.parse(event.data);
        } catch (err) {
            log_elem.innerText = "Error parsing JSON response";
        }
    
        try {
            switch (obj.event) {
            case "http request":
                new_request(obj);
                break;
            case "http request complete":
                request_complete(obj);
                break;
            case "http response":
                response_start(obj);
                break;
            case "http response body":
                response_body_chunk(obj);
                break;
            case "http response complete":
                response_complete(obj);
                break;
            case "reverse map":
                reverse_map(obj);
                break;
            case "websocket upgrade":
                websocket_start(obj);
                break;
            default:
                console.log("Don't know how to handle event type " + obj.event);
            }
        } catch (err) {
            log_elem.innerText = "Error dispatching event: " + err;
            throw err;
        }
    });

    socket.addEventListener('close', function (event) {
        console.log("WS close");
        log_elem.style.background = "rgb(170,170,170)";
        log_elem.innerText = 'WebSocket closed';

        console.log(event);
    });

    socket.addEventListener('error', function (event) {
        console.log("WS error");
        log_elem.style.background = "rgb(255,128,128)";
        log_elem.innerText = 'WebSocket error';
    });
}

var log_elem = document.getElementById('log'),
    socket = new WebSocket("ws://" + window.location.host),
    dns_cache = {}, sessions = {};

socket.addEventListener('open', function (event) {
    console.log("WS open");
    log_elem.style.background = "rgb(128,255,128)";
    log_elem.innerText = 'WebSocket Connected';
});

function parse_key(key) {
    var addr_pairs = key.split('-', 2);
    return {
        src: addr_pairs[0],
        dst: addr_pairs[1]
    };
}

function new_session(obj) {
    var elem = document.createElement('div'),
        addrs = parse_key(obj.key);

    sessions[obj.key] = {
        method: obj.method,
        url: obj.url,
        request_headers: obj.headers,
        elem: elem
    }
    
    elem.className = "session";
    elem.innerHTML = "<span class=\"address\">" + addrs.src + "</span><span class=\"method\">" + obj.method + " " + obj.url + "</span><br />" +
        "<div class=\"headers\">" +
        Object.keys(obj.headers).map(function (k) {
            return k + ": " + obj.headers[k];
        }).join("<br />") +
        "</div>";
    
    document.getElementById('sessions').appendChild(elem);
}

function add_response(obj) {
    var session = sessions[obj.key];
    
    session.elem.innerHTML += "<span class=\"response\">" + obj.status_code + "</span>" +
        "<div class=\"headers\">" +
        Object.keys(obj.headers).map(function (k) {
            return k + ": " + obj.headers[k];
        }).join("<br />") +
        "</div>";
}

function update_response_body(obj) {
    var session = sessions[obj.key];

    if (session === undefined) {
        console.log("Couldn't find session in obj " + obj.key);
    } else {
        session.elem.innerHTML += "<span class=\"body_chunk\">" + obj.data_length + "B<span>";
    }

function dns_lookup(addr) {
    var parts = addr.split(':', 2);
    if (dns_cache[parts[0]]) {
        return dns_cache[parts[0]] + ":" + parts[1];
    }
    return null;
}

function new_request(obj) {
    var addrs = parse_key(obj.key), requests, session_elem, request_elem, row, col1, col2;

    if (! sessions[obj.key]) {
        session_elem = document.createElement('table');
        session_elem.className = "session";
        row = session_elem.insertRow(0);
        col1 = row.insertCell(0);
        col2 = row.insertCell(1);
        col1.className = "src_addr";
        col1.innerHTML = dns_lookup(addrs.src) || addrs.src;
        col2.className = "requests";
        document.getElementById('sessions').appendChild(session_elem);
        sessions[obj.key] = {
            requests: [],
            elem: session_elem
        }
    } else {
        session_elem = sessions[obj.key].elem;
    }
    requests = sessions[obj.key].requests;

    request_elem = document.createElement('div');
    request_elem.className = "request start";
    request_elem.innerHTML = obj.method + " " + obj.url + " " + (obj.headers["User-Agent"] || obj.headers["Upgrade"] || "");

    session_elem.getElementsByClassName('requests')[0].appendChild(request_elem);
    
    requests.push({
        url: obj.url,
        method: obj.method,
        req_headers: obj.headers,
        elem: request_elem
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
    var addrs = parse_key(obj.key),
        session = sessions[obj.key],
        response_elem;

    if (typeof session !== 'object') {
        console.log("Couldn't find session " + obj.key + " in list, ignoring.");
        return;
    }

    session.requests[session.requests.length - 1].elem.className = "request";

    response_elem = document.createElement('div');
    response_elem.className = "response start";
    response_elem.innerHTML = obj.status_code + " " + obj.headers['Content-Type'];

    session.requests[session.requests.length - 1].elem.parentElement.appendChild(response_elem);
}

function response_body_chunk(obj) {
    var addrs = parse_key(obj.key),
        session = sessions[obj.key],
        response_elem;

    if (typeof session !== 'object') {
        console.log("Couldn't find session " + obj.key + " in list, ignoring.");
        return;
    }

    response_elem = session.requests[session.requests.length - 1].elem.nextSibling;
    response_elem.className = "response data";
    response_elem.innerHTML += " [data " + obj.data_length + "] ";
}

function response_complete(obj) {
    var addrs = parse_key(obj.key),
        session = sessions[obj.key],
        response_elem;

    if (typeof session !== 'object') {
        console.log("Couldn't find session " + obj.key + " in list, ignoring.");
        return;
    }

    response_elem = session.requests[session.requests.length - 1].elem.nextSibling;
    response_elem.className = "response";
    response_elem.innerHTML += " complete";
}

function reverse_map(obj) {
    dns_cache[obj.name] = obj.value;
    console.log("Adding " + obj.name + " to dns cache: " + obj.value);
}

function websocket_start(obj) {
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

    session.requests[session.requests.length - 1].elem.className = "request";

    response_elem = document.createElement('div');
    response_elem.className = "websocket start";
    response_elem.innerHTML = "WebSocket handshake";

    session.requests[session.requests.length - 1].elem.parentElement.appendChild(response_elem);
}

socket.addEventListener('message', function (event) {
    var obj;

    try {
        obj = JSON.parse(event.data);
    } catch (err) {
        log_elem.innerText = "Error parsing JSON response";
    }
    
    try {
        switch (obj.event) {
        case "http_request":
            new_session(obj);
            new_request(obj);
            break;
        case "http_request_body":
            break;
        case "http_request_complete":
            request_complete(obj);
            break;
        case "http_response":
            add_response(obj);
            break;
        case "http_response_body":
            update_response_body(obj);
            response_start(obj);
            break;
        case "http_response_body":
            response_body_chunk(obj);
            break;
        case "http_response_complete":
            response_complete(obj);
            break;
        case "reverse_map":
            reverse_map(obj);
            break;
        case "websocket_upgrade":
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


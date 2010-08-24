var log_elem = document.getElementById('log'),
    socket = new WebSocket("ws://" + window.location.host),
    dns_cache = {}, sessions = {};

socket.addEventListener('open', function (event) {
    console.log("WS open");
    log_elem.style.background = "rgb(128,255,128)";
    log_elem.innerText = 'WebSocket Connected';
});

function draw_blob(html) {
    var elem = document.createElement('div');
    elem.className = "animated_box";
    elem.style.left = (window.outerWidth - 200) + "px";
    elem.style.top = Math.round(Math.random() * (window.outerHeight - 250)) + "px";
    elem.innerHTML = html;
    elem.addEventListener('webkittransitionend', function () {
        console.log("removing that shit!");
        document.body.removeChild(elem);
    }, false);
    document.body.appendChild(elem);
    setTimeout(function () {
        elem.style.left = "200px";
    }, 10);
}

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
}

socket.addEventListener('message', function (event) {
//    console.log("WS message: " + event.data);
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
            break;
        case "http_request_body":
            break;
        case "http_request_complete":
            break;
        case "http_response":
            add_response(obj);
            break;
        case "http_response_body":
            update_response_body(obj);
            break;
        case "http_response_complete":
            break;
        default:
            console.log("Don't know how to handle event type " + obj.event);
        }
    } catch (err) {
        log_elem.innerText = "Error dispatching event: " + err;
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


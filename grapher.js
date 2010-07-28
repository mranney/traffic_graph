var graph = Raphael('graph');

var c = graph.circle(100, 100, 50).attr({
    fill: "hsb(.8, 1, 1)",
    stroke: "none",
    opacity: .5
});
var start = function () {
    // storing original coordinates
    this.ox = this.attr("cx");
    this.oy = this.attr("cy");
    this.attr({opacity: 1});
},
move = function (dx, dy) {
    // move will be called with dx and dy
    this.attr({cx: this.ox + dx, cy: this.oy + dy});
},
up = function () {
    // restoring state
    this.attr({opacity: .5});
};
c.drag(move, start, up);

var t = graph.text(100, 10, "Graph Data");

var log_elem = document.getElementById('log');

var socket = new WebSocket("ws://" + window.location.host);

socket.addEventListener('open', function (event) {
    console.log("WS open");
    log_elem.innerHTML += 'Connected.<br />';
});

socket.addEventListener('message', function (event) {
    console.log("WS message: " + event.data);

    try {
        var obj = JSON.parse(event.data);
        log_elem.innerHTML += event.data + "<br />";
    } catch (err) {
        log_elem.innerHTML += "Error parsing JSON response<br />";
    }
});

socket.addEventListener('close', function (event) {
    console.log("WS close");
    console.log(event);
});

socket.addEventListener('error', function (event) {
    console.log("WS error");
    console.log(event);
});


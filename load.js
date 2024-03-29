// import http from 'http';
// import crypto from 'crypto';
// import net from 'net';
const http = require('http');
const crypto = require('crypto');
const net = require('net');

// List of backend servers
const servers = [
    { host: 'localhost', port: 3000 },
    { host: 'localhost', port: 3001 },
    { host: 'localhost', port: 3002 },
    { host: 'localhost', port: 3003 },
    { host: 'localhost', port: 3004 },
    { host: 'localhost', port: 3005 },
    { host: 'localhost', port: 3006 },
    { host: 'localhost', port: 3007 },
    { host: 'localhost', port: 3008 },
    { host: 'localhost', port: 3009 },
    { host: 'localhost', port: 3010 },
    { host: 'localhost', port: 3011 },
    // Add more servers as needed
];

function calculateIPHash(ip) {
    const hash = crypto.createHash('sha256');
    hash.update(ip);
    const hashValue = hash.digest('hex');
    return parseInt(hashValue.substring(0, 8), 16); // Use first 8 bytes for simplicity
}

const server = http.createServer((req, res) => {
    const clientIP = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const hashValue = calculateIPHash(clientIP);
    const selectedServer = servers[hashValue % servers.length];

    console.log(`Request received from client IP: ${clientIP}`);
    console.log(`Hash value: ${hashValue}`);
    console.log(`Selected server: ${selectedServer.host}:${selectedServer.port}`);
    console.log(`Proxying request to ${selectedServer.host}:${selectedServer.port} ${req.method} ${req.url}`);
    console.log('\n');
    // Proxy the HTTP request to the selected server
    const proxy = http.request({
        hostname: selectedServer.host,
        port: selectedServer.port,
        path: req.url,
        method: req.method,
        headers: req.headers
    }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });

    req.pipe(proxy, { end: true });

    proxy.on('error', (err) => {
        console.error('Proxy request error:', err);
        res.writeHead(500);
        res.end('Proxy request error');
    });
});

// Handle WebSocket upgrades
server.on('upgrade', (req, socket, head) => {
    const clientIP = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const hashValue = calculateIPHash(clientIP);
    const selectedServer = servers[hashValue % servers.length];

    console.log(`Upgrading WebSocket connection for IP: ${clientIP}`);
    console.log(`WebSocket connection will be proxied to server: ${selectedServer.host}:${selectedServer.port}`);

    // Establish a TCP connection to the selected server
    const backendSocket = net.connect({
        host: selectedServer.host,
        port: selectedServer.port
    }, () => {
        console.log(`WebSocket connection established with server: ${selectedServer.host}:${selectedServer.port}`);
        socket.write('HTTP/1.1 101 Web Socket Protocol Handshake\r\n' +
                     'Upgrade: WebSocket\r\n' +
                     'Connection: Upgrade\r\n' +
                     '\r\n');
        backendSocket.write(head);
        backendSocket.pipe(socket);
        socket.pipe(backendSocket);
    });

    backendSocket.on('error', (err) => {
        console.error('WebSocket proxy error:', err);
        socket.end();
    });
});

const PORT = 8080;
server.listen(PORT, () => {
    console.log(`Load balancer running on port ${PORT}`);
});

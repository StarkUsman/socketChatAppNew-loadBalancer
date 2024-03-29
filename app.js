const express = require('express');
const path = require('path');
const { Server } = require('socket.io');
const http = require('http');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const { availableParallelism } = require('os');
const cluster = require('cluster');
const { createAdapter, setupPrimary } = require('@socket.io/cluster-adapter');

if (cluster.isPrimary) {
    const numCPUs = availableParallelism();
    // create one worker per available core
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork({
        PORT: 3000 + i
    });
}

// set up the adapter on the primary thread
setupPrimary();
} else {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, {
        connectionStateRecovery: {},
        adapter: createAdapter()
    });
    (async () => {
        const db = await open({
            filename: path.join(__dirname, 'chat.db'),
            driver: sqlite3.Database
    });
    const port = process.env.PORT;
    server.listen(port, () => console.log(`💬 server on port ${port}`));

    await db.exec(`
      DROP TABLE IF EXISTS messages;

      CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          message TEXT,
          dateTime TEXT
      );

      DELETE FROM messages;
    `);

    app.use(express.static(path.join(__dirname, 'public')));

    let socketsConnected = new Set();

    io.on('connection', async (socket) => {
      console.log(`Socket connected to server with socket id: `, socket.id);

      socketsConnected.add(socket.id);
      io.emit('clients-total', socketsConnected.size);

      try {
        const messages = await db.all('SELECT * FROM messages');
        messages.forEach(message => {
          console.log(message);
          socket.emit('chat-message', message);
        });
      } catch (error) {
        console.error('Error retrieving messages:', error);
      }

      socket.on('disconnect', () => {
        console.log('Socket disconnected', socket.id);
        socketsConnected.delete(socket.id);
        io.emit('clients-total', socketsConnected.size);
      });

      socket.on('message', async (data) => {
        try {
          await db.run('INSERT INTO messages (name, message, dateTime ) VALUES (?, ?, ?)', [data.name, data.message, data.dateTime]);
          console.log(data);
        } catch (error) {
          console.error('Error saving message to database:', error);
        }
        socket.broadcast.emit('chat-message', data);
      });

      socket.on('feedback', (data) => {
        socket.broadcast.emit('feedback', data);
      });
    });
  })();
}

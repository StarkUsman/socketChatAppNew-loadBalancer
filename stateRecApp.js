const express = require('express');
const path = require('path');
const app = express();
const http = require('http');
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`💬 server on port ${PORT}`));

const io = require('socket.io')(server);
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const uuid = require('uuid');

(async () => {
  const db = await open({
    filename: path.join(__dirname, 'chat.db'),
    driver: sqlite3.Database
  });

//   await db.exec(
//     `DROP TABLE IF EXISTS messages;`
//   );

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
    const clientOffset = uuid.v4(); // Generate a unique client offset for each client
    console.log('Socket connected', socket.id, 'with client offset', clientOffset);

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

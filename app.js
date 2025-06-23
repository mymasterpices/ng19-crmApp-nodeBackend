const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

// 2. App setup
const app = express();
const port = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath);
}


// 3. Middleware
app.use(cors());
app.use(express.json());
const serv_angular = 'public/dist/browser/';
app.use(express.static(path.join(__dirname, serv_angular))); // Serve Angular frontend
app.use('/uploads', express.static('uploads'));


// 4. Database connection
require('./connection');

// 5. Routes
const AuthRoutes = require('./routes/auth');
const CustomerRoutes = require('./routes/customerRoutes');
const ChatRoutes = require('./routes/chatRoutes');


app.use('/api/auth', AuthRoutes);
app.use('/api/customers', CustomerRoutes);
app.use('/api/chat', ChatRoutes);

// Wildcard route to serve Angular app
app.get('/*splat', async (req, res) => {
    res.sendFile(path.join(__dirname, serv_angular));
});



// 6. Start server
app.listen(port, () => {
    console.log(`🚀 Server is running on port ${port}`);
});

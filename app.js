const express = require('express');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const cors = require('cors');

// Ensure uploads directory exists
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath);
}

// 2. App setup
const app = express();
const port = process.env.PORT || 3000;

// 3. Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public/browser'))); // Serve Angular frontend
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

// 6. Start server
app.listen(port, () => {
    console.log(`🚀 Server is running on port ${port}`);
});

const express = require('express');
const router = express.Router();
const Chat = require('../models/chatSchema');
// const { verifyToken } = require('../middleware/jwt');


// Get chat by customer ID
router.get('/get/:customerId', async (req, res) => {
    try {
        const { customerId } = req.params;
        const chat = await Chat.findOne({ customerId }).populate('customerId', 'name mobile productName price seriousness');

        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }

        res.status(200).json(chat);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Add a new message to the chat
router.post('/add/:customerId', async (req, res) => {
    try {
        const { customerId } = req.params;
        const { message } = req.body;

        if (!message || typeof message !== 'string' || message.trim() === '') {
            return res.status(400).json({ message: 'Message is required and must be a non-empty string' });
        }

        const chat = await Chat.findOneAndUpdate(
            { customerId },
            { $push: { messages: { message, timestamp: new Date() } } },
            { new: true, upsert: true }
        ).populate('customerId', 'name mobile productName price seriousness');

        res.status(200).json(chat);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update a specific message inside a chat document
router.put('/update/:customerId/:chatId', async (req, res) => {
    try {
        const { customerId, chatId } = req.params;
        const { message } = req.body;

        if (!message || typeof message !== 'string' || message.trim() === '') {
            return res.status(400).json({ message: 'Message is required and must be a non-empty string' });
        }

        // Find chat document by customerId
        const chat = await Chat.findOne({ customerId });

        if (!chat) {
            return res.status(404).json({ message: 'Chat not found for customer' });
        }

        // Find the message by chatId inside messages array
        const messageToUpdate = chat.messages.id(chatId);

        if (!messageToUpdate) {
            return res.status(404).json({ message: 'Message not found' });
        }

        // Update the message content and timestamp
        messageToUpdate.message = message;
        messageToUpdate.timestamp = new Date();
        messageToUpdate.edited = true; // 👈 Add this line

        // Save the updated chat document
        await chat.save();

        // Optionally populate customer info
        await chat.populate('customerId', 'name mobile productName price seriousness');

        res.status(200).json(chat);

    } catch (error) {
        console.error('Error updating message:', error);
        res.status(500).json({ message: 'Server error' });
    }
});



//delete chat by chat ID
router.delete('/delete/:customerId/:messageId', async (req, res) => {
    try {
        const { customerId, messageId } = req.params;

        // Find the chat by customerId
        const chat = await Chat.findOne({ customerId });

        if (!chat) return res.status(404).json({ message: 'Chat not found for customer' });

        // Remove the message with given _id from messages array
        const updatedChat = await Chat.findByIdAndUpdate(
            chat._id,
            {
                $pull: {
                    messages: { _id: messageId }
                }
            },
            { new: true }
        );

        res.status(200).json({
            message: 'Message deleted successfully',
            updatedChat
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});


module.exports = router;
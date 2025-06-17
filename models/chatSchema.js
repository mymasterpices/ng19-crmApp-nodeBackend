const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true
    },
    messages: [
        {

            message: {
                type: String,
                required: true
            },
            edited: {
                type: Boolean,
                default: false // 👈 This is new
            },
            timestamp: {
                type: Date,
                default: Date.now,
                immutable: true
            }
        }
    ]
}, {
    timestamps: true
});

module.exports = mongoose.model('Chat', chatSchema);
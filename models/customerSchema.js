const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    mobile: {
        type: String,
        required: true,
        match: /^[0-9]{10}$/
    },
    productName: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    nextFollowUpDate: {
        type: Date
    },
    status: {
        type: String,
        enum: ['Open', 'Cold', 'Close'],
        default: 'open'
    },
    productImage: {
        type: String,
        required: true,
    },
    seriousness: {
        type: String,
        enum: ['High', 'Low', 'Neutral'],
        default: 'Neutral'
    },
    conversation: {
        type: String,
        default: ''
    },
    salesperson: {
        type: String,
        required: true
    },
}, {
    timestamps: true
});

module.exports = mongoose.model('Customer', customerSchema);

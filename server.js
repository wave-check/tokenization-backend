// server.js - Real Estate Tokenization Backend with MongoDB
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tokenization';

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(MONGODB_URI)
.then(() => {
    console.log('✅ Connected to MongoDB');
    initializeDefaultData();
})
.catch((err) => {
    console.error('❌ MongoDB connection error:', err);
});

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: String,
    fullName: String,
    createdAt: { type: Date, default: Date.now }
});

// Property Schema
const propertySchema = new mongoose.Schema({
    name: String,
    location: String,
    type: String,
    tokenPrice: Number,
    totalTokens: Number,
    soldTokens: { type: Number, default: 0 },
    annualReturn: Number,
    occupancyRate: Number,
    imageUrl: String,
    description: String
});

// Portfolio Schema
const portfolioSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    tokensOwned: Number,
    purchasePrice: Number,
    purchaseDate: { type: Date, default: Date.now }
});

// Transaction Schema
const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    type: String,
    tokens: Number,
    pricePerToken: Number,
    totalAmount: Number,
    platformFee: Number,
    netAmount: Number,
    paymentMethod: String,
    status: { type: String, default: 'completed' },
    transactionDate: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Property = mongoose.model('Property', propertySchema);
const Portfolio = mongoose.model('Portfolio', portfolioSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

// Initialize default data
async function initializeDefaultData() {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
        await User.insertMany([
            { username: 'admin1', password: bcrypt.hashSync('password1', 10) },
            { username: 'admin2', password: bcrypt.hashSync('password2', 10) }
        ]);
        console.log('✅ Default users created');
    }

    const propCount = await Property.countDocuments();
    if (propCount === 0) {
        await Property.insertMany([
            {
                name: 'Park Road Ngara',
                location: 'Ngara, Nairobi',
                type: 'Commercial',
                tokenPrice: 100,
                totalTokens: 50000,
                soldTokens: 35000,
                annualReturn: 8.5,
                occupancyRate: 95,
                imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800',
                description: 'Affordable housing in Ngara'
            },
            {
                name: 'Shauri Moyo Estate',
                location: 'Shauri Moyo, Nairobi',
                type: 'Residential',
                tokenPrice: 250,
                totalTokens: 40000,
                soldTokens: 40000,
                annualReturn: 7.2,
                occupancyRate: 100,
                imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800',
                description: '4,000+ units'
            },
            {
                name: 'Mukuru Housing Project',
                location: 'Mukuru, Nairobi',
                type: 'Commercial',
                tokenPrice: 500,
                totalTokens: 30000,
                soldTokens: 18000,
                annualReturn: 9.1,
                occupancyRate: 88,
                imageUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800',
                description: '13,248 units project'
            }
        ]);
        console.log('✅ Default properties created');
    }
}

// Auth middleware
function auth(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

// Routes
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, email, fullName } = req.body;
        const exists = await User.findOne({ username });
        if (exists) return res.status(400).json({ error: 'Username exists' });
        
        const user = new User({
            username,
            password: bcrypt.hashSync(password, 10),
            email,
            fullName
        });
        await user.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token, user: { id: user._id, username, email: user.email } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/properties', async (req, res) => {
    const properties = await Property.find();
    res.json(properties);
});

app.get('/api/properties/:id', async (req, res) => {
    const property = await Property.findById(req.params.id);
    res.json(property);
});

app.get('/api/portfolio', auth, async (req, res) => {
    const holdings = await Portfolio.find({ userId: req.user.id }).populate('propertyId');
    res.json(holdings.map(h => {
        const currentValue = h.tokensOwned * h.propertyId.tokenPrice;
        const invested = h.tokensOwned * h.purchasePrice;
        const gainLoss = currentValue - invested;
        const returnPercentage = invested > 0 ? ((gainLoss / invested) * 100).toFixed(2) : 0;
        
        return {
            propertyId: h.propertyId._id,
            name: h.propertyId.name,
            location: h.propertyId.location,
            tokensOwned: h.tokensOwned,
            tokenPrice: h.propertyId.tokenPrice,
            purchasePrice: h.purchasePrice,
            currentValue,
            invested,
            gainLoss,
            returnPercentage: parseFloat(returnPercentage)
        };
    }));
});

app.get('/api/stats/portfolio', auth, async (req, res) => {
    const holdings = await Portfolio.find({ userId: req.user.id }).populate('propertyId');
    let totalValue = 0, totalInvested = 0;
    holdings.forEach(h => {
        totalValue += h.tokensOwned * h.propertyId.tokenPrice;
        totalInvested += h.tokensOwned * h.purchasePrice;
    });
    res.json({
        totalValue,
        totalInvested,
        totalGain: totalValue - totalInvested,
        returnPercentage: totalInvested ? ((totalValue - totalInvested) / totalInvested * 100).toFixed(2) : 0
    });
});

app.get('/api/transactions', auth, async (req, res) => {
    const txs = await Transaction.find({ userId: req.user.id }).populate('propertyId');
    res.json(txs.map(t => ({
        type: t.type,
        property: t.propertyId.name,
        location: t.propertyId.location,
        tokens: t.tokens,
        totalAmount: t.totalAmount,
        timestamp: t.transactionDate
    })));
});

app.post('/api/transactions/buy', auth, async (req, res) => {
    const { property_id, tokens, payment_method } = req.body;
    const property = await Property.findById(property_id);
    
    if (tokens > property.totalTokens - property.soldTokens) {
        return res.status(400).json({ error: 'Not enough tokens' });
    }
    
    property.soldTokens += tokens;
    await property.save();
    
    const portfolio = await Portfolio.findOne({ userId: req.user.id, propertyId: property_id });
    if (portfolio) {
        portfolio.tokensOwned += tokens;
        await portfolio.save();
    } else {
        await new Portfolio({
            userId: req.user.id,
            propertyId: property_id,
            tokensOwned: tokens,
            purchasePrice: property.tokenPrice
        }).save();
    }
    
    await new Transaction({
        userId: req.user.id,
        propertyId: property_id,
        type: 'buy',
        tokens,
        pricePerToken: property.tokenPrice,
        totalAmount: tokens * property.tokenPrice,
        paymentMethod: payment_method
    }).save();
    
    res.json({ success: true, tokensPurchased: tokens });
});

app.post('/api/transactions/sell', auth, async (req, res) => {
    const { property_id, tokens } = req.body;
    const portfolio = await Portfolio.findOne({ userId: req.user.id, propertyId: property_id });
    
    if (!portfolio || portfolio.tokensOwned < tokens) {
        return res.status(400).json({ error: 'Insufficient tokens' });
    }
    
    const property = await Property.findById(property_id);
    property.soldTokens -= tokens;
    await property.save();
    
    portfolio.tokensOwned -= tokens;
    if (portfolio.tokensOwned === 0) {
        await Portfolio.deleteOne({ _id: portfolio._id });
    } else {
        await portfolio.save();
    }
    
    const grossAmount = tokens * property.tokenPrice;
    const platformFee = grossAmount * 0.02;
    
    await new Transaction({
        userId: req.user.id,
        propertyId: property_id,
        type: 'sell',
        tokens,
        pricePerToken: property.tokenPrice,
        totalAmount: grossAmount,
        platformFee,
        netAmount: grossAmount - platformFee
    }).save();
    
    res.json({ success: true, tokensSold: tokens, netAmount: grossAmount - platformFee });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
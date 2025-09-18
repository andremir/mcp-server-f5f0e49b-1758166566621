// Railway-compatible MCP Server
const express = require('express');
const cors = require('cors');

console.log('🚀 Starting MCP Server...');
console.log('Environment check:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  STRIPE_KEY_EXISTS: !!process.env.STRIPE_SECRET_KEY
});

const app = express();

// Essential middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// Add request logging
app.use((req, res, next) => {
  console.log(`📋 ${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint (CRITICAL for Railway)
app.get('/health', (req, res) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: {
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT,
      stripeConfigured: !!process.env.STRIPE_SECRET_KEY
    }
  };
  console.log('✅ Health check requested:', healthStatus);
  res.json(healthStatus);
});

// Initialize Stripe with comprehensive error handling
let stripe;
let stripeError = null;

try {
  if (process.env.STRIPE_SECRET_KEY) {
    console.log('🔐 Initializing Stripe...');
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    console.log('✅ Stripe initialized successfully');
  } else {
    console.warn('⚠️  STRIPE_SECRET_KEY not provided - running in limited mode');
  }
} catch (error) {
  stripeError = error.message;
  console.error('❌ Failed to initialize Stripe:', error);
}

// MCP Server Routes
app.get('/', (req, res) => {
  res.json({
    name: 'Stripe MCP Server',
    version: '1.0.0',
    description: 'Model Context Protocol server for Stripe API integration',
    tools: [
      'create_customer',
      'create_invoice', 
      'process_payment',
      'retrieve_customer'
    ],
    status: stripe ? 'ready' : 'stripe_not_configured'
  });
});

// MCP Protocol endpoint
app.post('/mcp', async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ 
      error: 'Stripe not configured - STRIPE_SECRET_KEY environment variable is required' 
    });
  }

  try {
    const { method, params } = req.body;
    
    switch (method) {
      case 'create_customer':
        const customer = await stripe.customers.create({
          email: params.email,
          description: params.description || 'Created via MCP'
        });
        return res.json({ success: true, customer });
        
      case 'create_invoice':
        // Create invoice items first
        for (const item of params.items || []) {
          await stripe.invoiceItems.create({
            customer: params.customer_id,
            amount: Math.round(item.amount * 100), // Convert to cents
            currency: params.currency || 'usd',
            description: item.description
          });
        }
        
        const invoice = await stripe.invoices.create({
          customer: params.customer_id,
          collection_method: 'send_invoice',
          days_until_due: 30
        });
        
        return res.json({ success: true, invoice });
        
      case 'process_payment':
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(params.amount * 100), // Convert to cents
          currency: params.currency || 'usd',
          payment_method: params.payment_method,
          customer: params.customer_id,
          confirmation_method: 'manual',
          confirm: true,
          return_url: 'https://your-website.com/return'
        });
        
        return res.json({ success: true, paymentIntent });
        
      case 'retrieve_customer':
        const retrievedCustomer = await stripe.customers.retrieve(params.customer_id);
        return res.json({ success: true, customer: retrievedCustomer });
        
      default:
        return res.status(400).json({ 
          error: 'Unknown method', 
          available_methods: ['create_customer', 'create_invoice', 'process_payment', 'retrieve_customer'] 
        });
    }
  } catch (error) {
    console.error('Stripe API error:', error);
    res.status(500).json({ 
      error: error.message,
      type: error.type || 'api_error'
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Stripe MCP Server running on port ${PORT}`);
  console.log(`Health check available at: http://localhost:${PORT}/health`);
  console.log(`Stripe configured: ${!!stripe}`);
});
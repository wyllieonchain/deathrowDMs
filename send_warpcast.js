import { Wallet } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

// Get API key from environment variables
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error('Error: API_KEY not found in environment variables');
  process.exit(1);
}

// Your message
const MESSAGE = "Hey! I'm launching a new onchain game, it's speculative, controversial, and volatile. Check it out and give us a follow on X if you're intrigued. We'll be giving out WL spots soon. https://x.com/DeathRowdotfun";

// Add a timestamp to log when the script was started with the current message
console.log(`Script started at ${new Date().toISOString()} with message: "${MESSAGE}"`);

// Function to send a direct message using Programmable DCs API
async function sendDirectMessage(apiKey, recipientFid, message) {
  try {
    // Generate a unique idempotency key (using a timestamp + random string)
    const idempotencyKey = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    
    const response = await fetch('https://api.warpcast.com/v2/ext-send-direct-cast', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        recipientFid: recipientFid,
        message: message,
        idempotencyKey: idempotencyKey
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to send message: ${JSON.stringify(errorData)}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error sending message to FID ${recipientFid}:`, error);
    throw error;
  }
}

// Function to read FIDs from hugeWalletsList.txt
function readFidsFromFile() {
  try {
    if (!fs.existsSync('hugeWalletsList.txt')) {
      return [];
    }
    
    const data = fs.readFileSync('hugeWalletsList.txt', 'utf8');
    return data.split('\n').map(line => line.trim()).filter(Boolean);
  } catch (error) {
    console.error('Error reading FIDs:', error);
    return [];
  }
}

// Function to remove a FID from hugeWalletsList.txt
function removeFidFromFile(fidToRemove) {
  try {
    const allFids = readFidsFromFile();
    const updatedFids = allFids.filter(fid => fid !== fidToRemove.toString());
    fs.writeFileSync('hugeWalletsList.txt', updatedFids.join('\n') + (updatedFids.length > 0 ? '\n' : ''));
    console.log(`Removed FID ${fidToRemove} from hugeWalletsList.txt`);
  } catch (error) {
    console.error(`Error removing FID ${fidToRemove}:`, error);
  }
}

// Function to read/write the daily message count
function getDailyMessageCount() {
  try {
    // Check if we have a count file for today
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const countFilePath = `message_count_${today}.txt`;
    
    if (!fs.existsSync(countFilePath)) {
      // If no file exists for today, create one with count 0
      fs.writeFileSync(countFilePath, '0');
      return 0;
    }
    
    // Read the current count
    const count = parseInt(fs.readFileSync(countFilePath, 'utf8').trim());
    return isNaN(count) ? 0 : count;
  } catch (error) {
    console.error('Error reading daily message count:', error);
    return 0;
  }
}

function updateDailyMessageCount(count) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const countFilePath = `message_count_${today}.txt`;
    fs.writeFileSync(countFilePath, count.toString());
  } catch (error) {
    console.error('Error updating daily message count:', error);
  }
}

// Main function to send messages
const sendMessages = async () => {
  try {
    // Check current daily message count
    let dailyCount = getDailyMessageCount();
    console.log(`Daily message count so far: ${dailyCount}`);
    
    // Check if we've already hit the daily limit
    const DAILY_LIMIT = 5000;
    if (dailyCount >= DAILY_LIMIT) {
      console.log(`⚠️ Daily limit of ${DAILY_LIMIT} messages already reached. Try again tomorrow.`);
      process.exit(0);
    }
    
    // Read FIDs from file
    const fids = readFidsFromFile();
    
    if (fids.length === 0) {
      console.error('No FIDs found in hugeWalletsList.txt');
      process.exit(1);
    }
    
    console.log(`Found ${fids.length} FIDs to message`);
    
    // Send messages to followers
    let successCount = 0;
    let failCount = 0;
    
    // Calculate how many more messages we can send today
    const remainingToday = DAILY_LIMIT - dailyCount;
    console.log(`Can send up to ${remainingToday} more messages today`);
    
    // Determine how many messages to send in this run (limit to remaining daily limit)
    const batchSize = Math.min(fids.length, remainingToday);
    const batchFids = fids.slice(0, batchSize);
    
    console.log(`Processing batch of ${batchFids.length} FIDs`);
    
    for (const fid of batchFids) {
      try {
        console.log(`Sending message to FID ${fid}...`);
        await sendDirectMessage(API_KEY, parseInt(fid), MESSAGE);
        console.log(`✅ Message sent to FID ${fid}`);
        
        // Remove this FID from the file since message was sent successfully
        removeFidFromFile(fid);
        
        successCount++;
        dailyCount++;
        
        // Update the daily count file after each successful message
        updateDailyMessageCount(dailyCount);
        
        // Check if we've hit the daily limit
        if (dailyCount >= DAILY_LIMIT) {
          console.log(`🛑 Daily limit of ${DAILY_LIMIT} messages reached. Stopping.`);
          break;
        }
        
        // Add a small delay between messages to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds delay
      } catch (error) {
        console.error(`❌ Failed to send to FID ${fid}:`, error.message);
        
        // Remove this FID from the file since it failed (could be invalid, blocked, etc.)
        removeFidFromFile(fid);
        console.log(`Removed failed FID ${fid} from hugeWalletsList.txt`);
        
        failCount++;
        
        // If we hit a rate limit, wait longer but don't remove the FID (temporary error)
        if (error.message.includes('rate limit') || error.message.includes('429')) {
          console.log('Rate limit hit, waiting for 30 seconds...');
          // Add the FID back to the list since this is a temporary error
          fs.appendFileSync('hugeWalletsList.txt', fid + '\n');
          console.log(`Added FID ${fid} back to hugeWalletsList.txt (rate limit error)`);
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
      }
    }
    
    console.log(`\nSummary: ${successCount} messages sent successfully, ${failCount} failed`);
    console.log(`Daily total: ${dailyCount}/${DAILY_LIMIT} messages sent today`);
    console.log(`${fids.length - (successCount + failCount)} FIDs remaining in hugeWalletsList.txt`);
    
    if (dailyCount >= DAILY_LIMIT) {
      console.log(`\n⚠️ Daily limit reached. Run the script again tomorrow.`);
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
  }
};

// Run the script
sendMessages();
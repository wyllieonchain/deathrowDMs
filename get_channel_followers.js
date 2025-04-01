import fs from 'fs';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

// Get channel ID from environment variables or use default
const CHANNEL_ID = process.env.CHANNEL_ID || 'blackhole';

// Function to get channel followers with pagination
async function getChannelFollowers(channelId, cursor = null) {
  try {
    let url = `https://api.warpcast.com/v1/channel-followers?channelId=${channelId}`;
    if (cursor) {
      url += `&cursor=${cursor}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch channel followers: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching channel followers:', error);
    throw error;
  }
}

// Function to read existing FIDs from hugeWalletsList.txt
function getExistingFids() {
  try {
    if (!fs.existsSync('hugeWalletsList.txt')) {
      return new Set();
    }
    
    const data = fs.readFileSync('hugeWalletsList.txt', 'utf8');
    return new Set(data.split('\n').map(line => line.trim()).filter(Boolean));
  } catch (error) {
    console.error('Error reading existing FIDs:', error);
    return new Set();
  }
}

// Main function to fetch all followers
async function fetchAllFollowers() {
  try {
    console.log(`Fetching followers for channel: ${CHANNEL_ID}`);
    
    // Get existing FIDs
    const existingFids = getExistingFids();
    console.log(`Found ${existingFids.size} existing FIDs in hugeWalletsList.txt`);
    
    // Get all followers with pagination
    let allFollowers = [];
    let nextCursor = null;
    let page = 1;
    
    do {
      console.log(`Fetching page ${page} of followers...`);
      const response = await getChannelFollowers(CHANNEL_ID, nextCursor);
      
      if (response.result && response.result.users) {
        allFollowers = [...allFollowers, ...response.result.users];
        console.log(`Found ${response.result.users.length} followers on page ${page}`);
      }
      
      nextCursor = response.next?.cursor;
      page++;
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } while (nextCursor);

    console.log(`Found a total of ${allFollowers.length} followers for channel ${CHANNEL_ID}`);
    
    // Extract FIDs and filter out ones that already exist in the file
    const newFids = allFollowers
      .map(follower => follower.fid.toString())
      .filter(fid => !existingFids.has(fid));
    
    console.log(`Found ${newFids.length} new FIDs to add to hugeWalletsList.txt`);
    
    if (newFids.length > 0) {
      // Append new FIDs to hugeWalletsList.txt
      fs.appendFileSync('hugeWalletsList.txt', newFids.join('\n') + '\n');
      console.log(`Added ${newFids.length} new FIDs to hugeWalletsList.txt`);
    }
    
  } catch (error) {
    console.error('Error fetching channel followers:', error);
  }
}

// Run the script
fetchAllFollowers();
/**
 * Test script for Google Drive upload functionality
 * 
 * Usage: node scripts/test-drive-upload.js
 */

require('dotenv').config();
const { uploadFile, getOrCreateClientFolder, getDriveClient } = require('../server/utils/googleDrive');

async function testDriveUpload() {
    console.log('\n=== Testing Google Drive Upload ===\n');

    try {
        // Test 1: Get Drive client
        console.log('1. Testing Drive authentication...');
        const drive = getDriveClient();
        console.log('   ✓ Drive client created\n');

        // Test 2: Verify Drive access
        console.log('2. Verifying Drive access...');
        const aboutRes = await drive.about.get({ fields: 'user' });
        console.log(`   ✓ Authenticated as: ${aboutRes.data.user.emailAddress}\n`);

        // Test 3: Get or create client folder
        console.log('3. Testing folder creation...');
        const folderId = await getOrCreateClientFolder(1, 'Test Client');
        console.log(`   ✓ Folder ID: ${folderId}\n`);

        // Test 4: Upload a test file
        console.log('4. Testing file upload...');
        const testContent = Buffer.from('This is a test file from Melloo Hub!', 'utf-8');
        const result = await uploadFile(
            1,
            'Test Client',
            testContent,
            'test-upload.txt',
            'text/plain'
        );

        console.log('   ✓ Upload successful!');
        console.log(`   File ID: ${result.fileId}`);
        console.log(`   View Link: ${result.viewLink}`);
        console.log(`   Download Link: ${result.downloadLink}\n`);

        console.log('=== All Tests Passed! ===\n');
        console.log('Next steps:');
        console.log('1. Visit the view link in your browser to confirm the file exists');
        console.log('2. Check Google Drive for "Melloo Media Clients/Test Client - Uploads" folder');
        console.log('3. Ready to build the API routes!\n');

        process.exit(0);
    } catch (err) {
        console.error('\n✗ Test failed:', err.message);
        if (err.response) {
            console.error('   Response:', err.response.data);
        }
        process.exit(1);
    }
}

testDriveUpload();

require('dotenv').config();
const { appendNoteToDoc } = require('./server/utils/driveHelpers');

async function test() {
    const docId = '1pjG_VF65fZOvGIgnZ0-6nX9wdE_xQp1fFmPoGOzgUVg';
    console.log('Appending to doc:', docId);

    try {
        await appendNoteToDoc(docId, 'Test Note from Debug Script', 'DebugUser');
        console.log('Success!');
    } catch (e) {
        console.error('Test Failed:', e);
    }
}

test();

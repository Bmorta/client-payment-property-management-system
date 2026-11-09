import test from 'node:test';
import assert from 'node:assert/strict';
import {registerFeedback,removeFeedback,dismissFeedback,feedbackSnapshot,showFeedback} from '../../client/src/utils/feedbackStore.js';
test('shared feedback deduplicates visible messages and permits explicit reopening without losing the local explanation',()=>{
 registerFeedback('test-a','error','Missing reason');registerFeedback('test-b','error','Missing reason');
 assert.equal(feedbackSnapshot().message,'Missing reason');dismissFeedback(feedbackSnapshot());assert.equal(feedbackSnapshot(),null);
 removeFeedback('test-a');assert.equal(feedbackSnapshot(),null);showFeedback('error','Missing reason');assert.equal(feedbackSnapshot().message,'Missing reason');
 removeFeedback('test-b');assert.equal(feedbackSnapshot(),null);
 registerFeedback('test-c','warning','Review first');assert.equal(feedbackSnapshot().kind,'warning');removeFeedback('test-c');
});

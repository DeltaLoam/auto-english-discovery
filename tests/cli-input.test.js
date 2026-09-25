import assert from "node:assert/strict";
import { PassThrough, Writable } from "node:stream";
import { createPrompt } from "../lib/cli-input.js";

const input = new PassThrough();
const output = new Writable({
  write(_chunk, _encoding, callback) {
    callback();
  },
});
const prompt = createPrompt(input, output);

const answers = Promise.all([
  prompt("subject: "),
  prompt("student: "),
  prompt("all: "),
]);
input.end("fe1\nstudent-id\ny\n");

assert.deepEqual(await answers, ["fe1", "student-id", "y"]);
prompt.close();
console.log("cli-input: piped prompts validated");

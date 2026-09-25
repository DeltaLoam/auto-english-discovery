import readline from "node:readline";

export function createPrompt(input = process.stdin, output = process.stdout) {
  const reader = readline.createInterface({ input, output });
  const pending = [];
  let closed = false;

  reader.on("line", (line) => {
    pending.shift()?.(line);
  });

  reader.on("close", () => {
    closed = true;
    while (pending.length) pending.shift()("");
  });

  return Object.assign(
    (question = "") =>
      new Promise((resolve) => {
        output.write(question);
        if (closed) resolve("");
        else pending.push(resolve);
      }),
    { close: () => reader.close() }
  );
}

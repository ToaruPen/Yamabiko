const runMode = process.env.RUN_MODE ?? "dry-run";

let heartbeat: NodeJS.Timeout | undefined;

function stopWorker(exitCode: number): void {
  if (heartbeat !== undefined) {
    clearInterval(heartbeat);
    heartbeat = undefined;
  }

  process.exit(exitCode);
}

process.stdout.write(
  `Call-n-Response worker scaffold started in ${runMode} mode.\n`,
);

heartbeat = setInterval(() => {
  process.stdout.write("worker heartbeat\n");
}, 60_000);

process.on("SIGINT", () => {
  stopWorker(0);
});

process.on("SIGTERM", () => {
  stopWorker(0);
});

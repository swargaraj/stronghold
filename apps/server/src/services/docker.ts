export type DockerCommandResult = {
  stdout: string;
  stderr: string;
};

export class DockerCommandError extends Error {
  readonly exitCode: number;
  readonly stderr: string;

  constructor(message: string, exitCode: number, stderr: string) {
    super(message);
    this.name = "DockerCommandError";
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

export async function runDocker(args: string[]): Promise<DockerCommandResult> {
  const process = Bun.spawn(["docker", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  if (exitCode !== 0) {
    throw new DockerCommandError(`docker ${args.join(" ")} failed`, exitCode, stderr.trim());
  }

  return {
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

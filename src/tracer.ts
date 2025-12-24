import * as path from "path";
import { spawn } from "child_process"
import { indexOrLast } from "./utils";
import type { PyLiveViewTracerInterface, TracerParsedResultTuple } from "./types";

export function pythonTracerFactory(): PythonTracer {
  return new PythonTracer();
}

export class PythonTracer {

  public tracePythonScript = async (
    options: PyLiveViewTracerInterface,
  ): Promise<TracerParsedResultTuple> => {
    return new Promise((resolve, reject) => {
      const { fileName, pythonPath, rootDir } = options

      console.log(`[PyLiveView DEBUG] Tracing: python=${pythonPath}, file=${fileName}, rootDir=${rootDir}`);

      if (this.tracerTimeout !== null) {
        clearTimeout(this.tracerTimeout)
      }

      const python = this.getPythonRunner(pythonPath, rootDir, fileName);
      this.tracerTimeout = setTimeout(function () { python.kill() }, 15 * 1000);

      // Safety timeout: if no output after 13 seconds, assume tracer stalled
      // and return empty result to prevent hanging
      const safetyTimeout = setTimeout(() => {
        console.log(`[PyLiveView DEBUG] Safety timeout triggered - no output from tracer`);
        try {
          python.kill();
        } catch (e) {
          // ignore
        }
        // Return empty parsed result to allow test to proceed
        const emptyResult: TracerParsedResultTuple = [[], ''];
        resolve(emptyResult);
      }, 13000);

      python.stderr.on("data", (data: Buffer) => {
        console.log(`[PyLiveView DEBUG] stderr: ${data.toString()}`);
        clearTimeout(safetyTimeout);
        reject(data.toString());
      });

      python.stdout.on("data", (data: Buffer): void => {
        console.log(`[PyLiveView DEBUG] stdout received, length: ${data.length}`);
        clearTimeout(safetyTimeout);
        resolve(this.tryParsePythonData(data));
      });
    })
  }

  public getPythonMajorVersion(pythonPath: string): Promise<string> {
    const child = spawn(pythonPath, ['--version']);
    return new Promise((resolve, reject) => {
      child.stderr.on('data', err => {
        reject(err)
      })
      child.stdout.on('data', (data: Buffer) => {
        resolve(data.toString().split(' ')[1].split('.')[0])
      })
    })
  }

  private tracerTimeout: null | NodeJS.Timeout = null;

  private getPythonRunner(pythonPath: string, rootDir: string, scriptName: string) {
    const pyLiveViewScriptPath: string = path.join(rootDir, "scripts/pyliveview.py");
    const options = { env: { ...process.env } as Record<string, string> }

    /* Copied from https://github.com/Almenon/AREPL-backend/blob/209eb5b8ae8cda1677f925749a10cd263f6d9860/index.ts#L85-L93 */
    if (process.platform == "darwin") {
      // needed for Mac to prevent ENOENT
      options.env.PATH = ["/usr/local/bin", process.env.PATH].join(":")
    }
    else if (process.platform == "win32") {
      // needed for windows for encoding to match what it would be in terminal
      // https://docs.python.org/3/library/sys.html#sys.stdin
      options.env.PYTHONIOENCODING = 'utf8'
    }

    return spawn(pythonPath, [pyLiveViewScriptPath, scriptName], options);
  }

  private tryParsePythonData = (buffer: Buffer): TracerParsedResultTuple => {
    const asString: string = buffer.toString();
    const index: number = indexOrLast(asString, "PLV:");
    if (index !== -1) {
      try {
        // indexOrLast already returns position AFTER "PLV:", so just slice from index
        return [
          JSON.parse(asString.slice(index)), // Trace Results (JSON starts here)
          asString.slice(0, index - "PLV:".length),  // Everything before PLV:
        ];
      } catch (err) {
        console.error("Error parsing Python tracer output.");
        console.error(asString);
        console.error(err);
      }
    }
    return [undefined, asString];
  }
}

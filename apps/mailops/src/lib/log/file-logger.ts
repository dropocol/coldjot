import fs from "fs";
import path from "path";
import { format } from "date-fns";

class FileLogger {
  private static instance: FileLogger;
  private logDir: string;
  private currentLogFile: string;

  private constructor() {
    // Create logs directory in the project root
    this.logDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Create a new log file for each day
    this.currentLogFile = this.getLogFilePath();
  }

  public static getInstance(): FileLogger {
    if (!FileLogger.instance) {
      FileLogger.instance = new FileLogger();
    }
    return FileLogger.instance;
  }

  /**
   * Get the path to the log file for a specific date
   * @param date Optional date to get log file for. If not provided, uses current date
   * @returns Full path to the log file
   */
  private getLogFilePath(date?: Date): string {
    const targetDate = date || new Date();
    const fileName = `gmail-notifications-${format(targetDate, "yyyy-MM-dd")}.log`;
    return path.join(this.logDir, fileName);
  }

  public log(level: string, message: string, data?: any): void {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        level: level.toUpperCase(),
        message,
        data: data || {},
      };

      const logString = JSON.stringify(logEntry, null, 2) + "\n";

      // Check if we need to create a new log file for a new day
      const newLogFile = this.getLogFilePath();
      if (newLogFile !== this.currentLogFile) {
        this.currentLogFile = newLogFile;
      }

      // Append to log file
      fs.appendFileSync(this.currentLogFile, logString);
    } catch (error) {
      console.error("Failed to write to log file:", error);
    }
  }

  public async getRecentLogs(days: number = 1): Promise<string[]> {
    const logs: string[] = [];
    const currentDate = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(currentDate);
      date.setDate(date.getDate() - i);
      const filePath = this.getLogFilePath(date);

      if (fs.existsSync(filePath)) {
        const content = await fs.promises.readFile(filePath, "utf-8");
        logs.push(content);
      }
    }

    return logs;
  }

  public async getLogsForTimeRange(
    startTime: Date,
    endTime: Date
  ): Promise<any[]> {
    const logs: any[] = [];
    const currentDate = new Date(endTime);
    const startDate = new Date(startTime);

    while (currentDate >= startDate) {
      const filePath = this.getLogFilePath(currentDate);

      if (fs.existsSync(filePath)) {
        const content = await fs.promises.readFile(filePath, "utf-8");
        const entries = content
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
          .filter((entry) => {
            const entryTime = new Date(entry.timestamp);
            return entryTime >= startTime && entryTime <= endTime;
          });
        logs.push(...entries);
      }

      currentDate.setDate(currentDate.getDate() - 1);
    }

    return logs;
  }
}

export const fileLogger = FileLogger.getInstance();

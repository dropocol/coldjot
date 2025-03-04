import { Queue, Job } from "bullmq";
import { BaseProcessor } from "../base-processor";
import { prisma } from "@coldjot/database";
import { logger } from "@/lib/log";

import { processContactShared } from "@/services/jobs/sequence/helper";
import { CONTACT_PROCESSING_CONFIG } from "@/config";
import { QUEUE_NAMES } from "@/config";
import { getWorkerOptions } from "@/config";

import { ServiceManager } from "@/services/service-manager";

import { SequenceContactStatusEnum, type EmailJob } from "@coldjot/types";

interface ContactProcessingJob {
  type: "CHECK_NEW_CONTACTS";
}

export class ContactProcessor extends BaseProcessor<ContactProcessingJob> {
  private checkInterval: number = CONTACT_PROCESSING_CONFIG.CHECK_INTERVAL;
  private batchSize: number = CONTACT_PROCESSING_CONFIG.BATCH_SIZE;
  private readonly SCHEDULER_ID = "contact-processing-scheduler";

  private serviceManager = ServiceManager.getInstance();
  private jobManager = this.serviceManager.getJobManager();

  constructor(queue: Queue) {
    super(queue, QUEUE_NAMES.CONTACT, getWorkerOptions(QUEUE_NAMES.CONTACT));
    this.setupContactProcessingScheduler();
  }

  /**
   * Set up the job scheduler for periodic contact checking
   */
  private async setupContactProcessingScheduler(): Promise<void> {
    try {
      // Create a job scheduler that runs every checkInterval milliseconds
      await this.queue.upsertJobScheduler(
        this.SCHEDULER_ID,
        { every: this.checkInterval },
        {
          // name: "check-new-contacts",
          // data: { type: "CHECK_NEW_CONTACTS" },
          opts: {
            removeOnComplete: true,
            removeOnFail: true,
          },
        }
      );
      logger.info(
        `👳‍♂️ Contact processing scheduler initialized with ${this.checkInterval}ms interval`
      );
    } catch (error) {
      logger.error(
        "👳‍♂️ ❌ Failed to setup contact processing scheduler:",
        error
      );
      throw error;
    }
  }

  protected async process(job: Job<ContactProcessingJob>): Promise<void> {
    logger.info(`💁‍♂️ Processing contact job ${job.id}`);
    try {
      // if (job.data.type === "CHECK_NEW_CONTACTS") {
      await this.processNewContacts();
      // }
    } catch (error) {
      logger.error(`Failed to process contact job ${job.id}:`, error);
      throw error;
    }
  }

  /**
   * Process new contacts with not_sent status
   */
  private async processNewContacts(): Promise<void> {
    try {
      logger.info("👳‍♂️ Checking for new contacts to process");

      // Find contacts that haven't been processed yet
      const newContacts = await prisma.sequenceContact.findMany({
        where: {
          status: SequenceContactStatusEnum.NOT_STARTED,
          lastProcessedAt: null,
        },
        include: {
          sequence: {
            include: {
              sequenceMailbox: true,
              steps: {
                orderBy: {
                  order: "asc",
                },
              },
              businessHours: true,
            },
          },
          contact: true,
        },
        take: this.batchSize,
      });

      logger.info(`👳‍♂️ Found ${newContacts.length} new contacts to process`);

      // Process each contact
      for (const contact of newContacts) {
        try {
          await this.processContact(contact);
        } catch (error) {
          logger.error(
            `❌ Error processing contact ${contact.contact.email}:`,
            error
          );
          // Continue with next contact even if one fails
          continue;
        }
      }

      logger.info("👳‍♂️ ✅ Completed processing batch of new contacts");
    } catch (error) {
      logger.error("👳‍♂️ ❌ Error in processNewContacts:", error);
      throw error;
    }
  }

  /**
   * Process an individual contact
   */

  // TODO : add a way to not check the contacts if parent sequence is paused
  private async processContact(contact: any): Promise<void> {
    const { sequence, contact: contactDetails } = contact;

    await processContactShared(
      {
        sequence,
        contact: contactDetails,
        currentStep: 1, // Contact processor always starts with step 1
        startedAt: new Date(),
      },
      this.jobManager
    );
  }
}

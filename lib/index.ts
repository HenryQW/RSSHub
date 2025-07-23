import { serve } from '@hono/node-server';
import logger from '@/utils/logger';
import { getLocalhostAddress } from '@/utils/common-utils';
import { config } from '@/config';
import app from '@/app';
import os from 'node:os';
import cluster from 'node:cluster';
import process from 'node:process';
import { ofetch } from 'ofetch';
import cron from 'node-cron';

const port = config.connect.port;
const hostIPList = getLocalhostAddress();

const logServerInfo = () => {
    logger.info(`🎉 RSSHub is running on port ${port}! Cheers!`);
    logger.info(`🔗 Local: 👉 http://localhost:${port}`);
    if (config.listenInaddrAny) {
        for (const ip of hostIPList) {
            logger.info(`🔗 Network: 👉 http://${ip}:${port}`);
        }
    }
};

const setupCronJobs = () => {
    cron.schedule('*/3 * * * *', sendHeartbeatToRSS3);
    logger.info('sendHeartbeatToRSS3 run every 3 minutes');
};

const createServer = () =>
    serve({
        fetch: app.fetch,
        hostname: config.listenInaddrAny ? '::' : '127.0.0.1',
        port,
        serverOptions: {
            maxHeaderSize: 1024 * 32,
        },
    });

let server;
if (config.enableCluster) {
    if (cluster.isPrimary) {
        logServerInfo();
        logger.info(`Primary ${process.pid} is running`);

        setupCronJobs();

        const numCPUs = os.availableParallelism();
        for (let i = 0; i < numCPUs; i++) {
            cluster.fork();
        }
    } else {
        logger.info(`Worker ${process.pid} is running`);
        createServer();
    }
} else {
    logServerInfo();
    setupCronJobs();
    server = createServer();
}

const sendHeartbeatToRSS3 = async () => {
    try {
        const rss3Url = 'https://api.rss3.dev/v1/heartbeat';
        await ofetch(rss3Url, {
            method: 'POST',
            body: {
                name: config.nodeName || '',
                address: config.rss3.address || '',
                endpoint: config.rss3.endpoint || '',
                signature: config.rss3.signature || '',
                timestamp: Math.floor(Date.now() / 1000),
            },
        });
    } catch (error) {
        logger.error('Error sending heartbeat to RSS3:', error);
    }
};

export default server;

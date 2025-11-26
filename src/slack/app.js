import { App } from '@slack/bolt';

/**
 * Slack Bot App con Socket Mode
 * Socket Mode permite que el bot funcione sin necesidad de exponer endpoints públicos
 */
const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

export default slackApp;

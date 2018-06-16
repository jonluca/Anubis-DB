module.exports = {
    /**
     * Application configuration section
     * http://pm2.keymetrics.io/docs/usage/application-declaration/
     */
    apps: [// First application
        {
            name: 'Anubis',
      log_date_format: 'YYYY-MM-DDTHH:mm:ss.SSS',
	 script: 'bin/www', env: {
            NODE_ENV: 'production'
        }
        }]
};

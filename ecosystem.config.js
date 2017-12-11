module.exports = {
    /**
     * Application configuration section
     * http://pm2.keymetrics.io/docs/usage/application-declaration/
     */
    apps: [// First application
        {
            name: 'Anubis', script: 'bin/www', env: {
            NODE_ENV: 'production'
        }
        }]
};
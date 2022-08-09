require('logger');

// DBLogger logs to a the logging/mysql.php page,
// which saves to a MySQL database. See more in
// logging/README.md
function DBLogger(interval) {
    Logger.call(this, interval);
}

DBLogger.prototype = Object.create(Logger.prototype);

DBLogger.prototype.storeMessages = function(logs) {
    var data = {
        'userInfo': this.userInfo(),
        'logs': logs,
    };
    // Approximate max length of a TEXT field in MySQL
    var maxCodeLength = 65000;
    var maxMessageLength = 64;
    logs.forEach(function(log) {
        if (log.code && log.code.length > maxCodeLength) {
            this.logErrorMessageLater(
                'Attempted to log code with length ' + log.code.length +
                ' > ' + maxCodeLength + '. ' + 'Log was truncated.');
            log.code = log.code.substring(0, maxCodeLength);
        }
        if (log.message && log.message.length > maxMessageLength) {
            this.logErrorMessageLater('Log messages must be < 64 characters: ' +
                log.message);
            log.message = log.message.substring(0, maxMessageLength - 3) +
                '...';
        }
    }, this);
    this.sendToServer(JSON.stringify(data), 0);
};

DBLogger.prototype.sendToServer = function(data, attempts) {
    if (attempts >= 3) {
        // this.log('Log.failure'); // creates a loop, probably not good
        return; // max retries if the logging fails
    }

    var xhr = new XMLHttpRequest();
    var myself = this;
    var retry = false;
    xhr.onreadystatechange = function() {
        // If we get a successful response with response text, that means that
        // there was an error saving these logs, but we should not retry sending
        if (xhr.status === 200 && xhr.readyState === 4 &&
               xhr.responseText.length > 0) {
            myself.logErrorMessageNow('Failed to log data: ' +
                xhr.responseText);
        }
        // If there was a non-200 status, that means there was another error,
        // like connecting to MySQL, and we should retry sending
        if (xhr.status > 0 && xhr.status !== 200 && !retry) {
            retry = true;
            setTimeout(function() {
                myself.sendToServer(data, attempts + 1);
            }, 1000);
        }
    };
    xhr.open('POST', 'logging/mysql.php', true);
    xhr.send(data);
};

DBLogger.prototype.logErrorMessageNow = function(message) {
    // Don't log an error that was caused by logging an error
    if (this.loggingError) return;
    // Send logs before and after to ensure that this message goes by itself
    this.sendLogs();
    this.loggingError = true;
    this.logErrorMessage(message);
    this.loggingError = false;
    this.sendLogs();
};

DBLogger.prototype.logErrorMessageLater = function(message) {
    var myself = this;
    // Delay the message so we can finish processing the current logs
    window.setTimeout(function() {
        myself.logErrorMessageNow(message);
    });
};
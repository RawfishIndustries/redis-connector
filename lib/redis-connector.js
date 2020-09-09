const RedisAux = require('redis-client-aux');
const chalk = require('chalk');

let RedisConnector = (function () {
    let redisClientAux;

    function initialize() {
        try {
            // setup the redis connection
            const redisOptions = {
                host: process.env.REDIS_URL || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                options: {},
                retry_strategy(options) {
                    console.log('[RedisConnector] going to reconnect after: ' + Math.min(options.attempt * 100, 3000));
                    return Math.min(options.attempt * 100, 3000);
                }
            };
    
            redisClientAux = new RedisAux(redisOptions);
    
            redisClientAux.events.on('connect', () => {
                console.log(chalk.green("[RedisConnector] Redis is now connected on: ", process.env.REDIS_URL));
            })
            
            redisClientAux.events.on('ready', () => {
                console.log(chalk.green('[RedisConnector] Redis is now ready on :', process.env.REDIS_URL));
            })
        } catch (err) {
            // Handle the error here.
            console.log("[RedisConnector] %s", err);
        }
    }

    function cacheClear(url, firebaseUid) {
        return new Promise((resolve, reject) => {
            let keyFirebaseUid = '_cached_' + url + '_' + firebaseUid;
            let keyPublic = '_cached_' + url;

            redisClientAux.del(keyFirebaseUid).then((result) => {
                //console.log('[REDIS] Removing key ' + keyPublic);
                redisClientAux.del(keyPublic).then((result) => {
                    resolve(result);
                }, (err) => {
                    reject(err);
                })
            });
        });
    };

    function clearCustomCache(urlPath, firebaseUid) {
        return new Promise((resolve, reject) => {
            let keyFirebaseUid = '_cached_' + urlPath + '_' + firebaseUid;
            let keyPublic = '_cached_' + urlPath;

            redisClientAux.del(keyFirebaseUid).then((result) => {
                return redisClientAux.del(keyPublic);
            }).then((result) => {
                resolve();
            }).catch((error) => {
                reject(error);
            });
        });
    }


    var middlewareCacheClean = () => {
        return (req, res, next) => {
            let baseUrl = req.baseUrl.replace(/\/$/, "");
            let originalUrl = req.originalUrl.replace(/\/$/, "");
    
            if (req.method === "POST") {
                cacheClear(baseUrl, res.locals.firebase_uid).then((result) => {
                    next();
                });
            } else if (req.method !== "GET") {
                cacheClear(baseUrl, res.locals.firebase_uid).then((result) => {
                    cacheClear(originalUrl, res.locals.firebase_uid).then((result) => {
                        next();
                    });
                }).catch((error) => {
                    console.log(chalk.red("ERROR: ", error));
                    next();
                });
            } else {
                next();
            }
        }
    };
    
    
    var middlewareCacheData = (duration, useUserUid = false) => {
        return (req, res, next) => {
            let key = useUserUid ? '_cached_' + req.originalUrl.replace(/\/$/, "") + '_' + res.locals.firebase_uid : '_cached_' + req.originalUrl.replace(/\/$/, "");
            //console.log(key);
            
            redisClientAux.get(key).then((result) => {
                //console.log(result);
                if (result) {
                    let resultParsed = JSON.parse(result);
                    //console.log('[REDIS] Found key ' + key);
                    res.header("Content-Type",'application/json');
                    res.header("X-Is-Cached",'Yes');
                    res.send(resultParsed);
                    return 
                } else {
                    var end = res.end;
                    res.end = (chunk, encoding) => {
                        //console.log('[REDIS] Res ' + res.statusCode);
                        
                        if (res.statusCode < 300) {
                            //console.log('[REDIS] Set key ' + key);
                            redisClientAux.set(key, chunk, duration);
                        }
                        res.end = end;
                        res.end(chunk, encoding);
                        return
                    };
                    next();
                }
                
            }, (err) => {
                //console.log(err);
                next();
            })
        }
    }

    return {
        clearCustomCache: clearCustomCache,
        middlewareCacheData: middlewareCacheData,
        middlewareCacheClean: middlewareCacheClean,
        initialize: initialize
    }

})();


module.exports = RedisConnector;

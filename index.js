require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const expressSession = require('express-session');
const RedisStore = require('connect-redis')(expressSession);
const redis = require('redis');
const logger = require('morgan');
const passport = require('passport');
const LocalStratergy = require('passport-local').Strategy;
const mongoose = require('mongoose');

function init(appData) {
    return new Promise((resolve, reject) => {
        console.log('Init...');
        resolve(appData);
    });
}

function connectToRedis(appData) {
    return new Promise((resolve, reject) => {
        const redisClient = new redis.createClient({
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT,
            password: process.env.REDIS_PASSWORD
        });
        redisClient.on('connect', () => {
            appData.redisClient = redisClient;
            resolve(appData);
        });
        redisClient.on('error', reject);
    });
}

function connectToMongo(appData) {
    return new Promise((resolve, reject) => {
        mongoose.connect(`mongodb://${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/${process.env.MONGO_DATABASE}`, {
            user: process.env.MONGO_USERNAME,
            pass: process.env.MONGO_PASSWORD
        });
        const db = mongoose.connection;
        db.on('connected', () => {
            appData.mongoClient = db;
            resolve(appData);
        });
        db.on('error', reject);
    });
}

function defineModels(appData) {
    return new Promise((resolve, reject) => {
        const userSchema = new mongoose.Schema({
            email: {
                type: String,
                maxlength: 50,
                minlength: 3,
                required: true,
                unique: true
            },
            password: {
                type: String,
                maxlength: 50,
                required: true
            },
            displayName: {
                type: String,
                maxlength: 20
            }
        });

        const User = mongoose.model('User', userSchema);

        appData.schemas['userSchema'] = userSchema;
        appData.models['User'] = User;
        resolve(appData);
    });
}

function configureApp(appData) {
    return new Promise((resolve, reject) => {
        const app = express();
        app.use(logger('combined'));
        app.use(cookieParser());
        app.use(bodyParser.urlencoded({ extended: true }));
        app.use(expressSession({
            store: new RedisStore({
                client: appData.redisClient
            }),
            secret: 'zsafda23rfdsgfvaASsfa$',
            resave: false,
            saveUninitialized: false
        }));

        app.use(passport.initialize());
        app.use(passport.session());

        passport.use(new LocalStratergy({
            usernameField: 'email',
            passwordField: 'password'
        }, (email, password, next) => {
            User.findOne({ email, password }, (err, user) => {
                if (err) next(err, false);
                else if (!user) next(err, false);
                else next(null, user);
            });
        }));

        passport.serializeUser((user, next) => {
            console.log(user)
            next(null, user._id);
        });

        passport.deserializeUser((userId, next) => {
            User.findById(userId, (err, user) => {
                if (err) next(err, false);
                else if (!user) next(err, false);
                else next(null, user);
            });
        });

        appData.passport = passport;
        appData.app = app;
        resolve(appData);
    });
}

function defineRoutes(appData) {
    return new Promise((resolve, reject) => {
        const app = appData.app;

        app.get('/', (req, res) => {
            res.status(200).send('OK');
        });

        app.get('/help', (req, res) => {
            res.send('Login to continue...');
        })

        app.post('/login', passport.authenticate('local', { failureRedirect: '/help' }), (req, res) => {
            res.status(200).json(req.user);
        });

        app.get('/logout', (req, res) => {
            req.logout();
            res.redirect('/');
        });

        app.get('/profile', (req, res) => {
            if (!req.user) res.redirect('/help');
            res.send(req.user);
        });

        app.post('/register', (req, res) => {
            if (req.body.email && req.body.password && req.body.displayName) {
                let user = new User({
                    email: req.body.email,
                    password: req.body.password,
                    displayName: req.body.displayName
                });
                console.log(user)
                user.save((err, user) => {
                    if (err) {
                        res.status(400).send(err);
                    } else {
                        passport.authenticate('local');
                        res.json(user);
                    }
                });
            } else {
                res.status(400).send('Provide user details');
            }
        });

        app.put('/change', (req, res) => {
            if (req.user && req.body.password) {
                User.findById(req.user._id, (err, user) => {
                    if (user) {
                        user.password = req.body.password;
                        user.save((err, user) => {
                            if (err) {
                                res.status(400).send(err);
                            } else {
                                res.send(user);
                            }
                        });
                    } else {
                        res.status(400).send('Provide user details');
                    }
                });
            } else {
                res.status(400).send('Login first');
            }
        });

        resolve(appData);
    });

}

function startApp(appData) {
    appData.app.listen(3000, () => console.log('Listening on 3000'));
}

((appData) => {
    init(appData)
        .then(connectToRedis)
        .then(connectToMongo)
        .then(defineModels)
        .then(configureApp)
        .then(defineRoutes)
        .then(startApp)
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
})({ schemas: [], models: [] });











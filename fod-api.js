'use strict';

/**
 * $: Shortnand variable for common functionality.
 */
const $ = {
    //$.${0,1,2} will be used to encapsulate logging. 0=error, 1=warning, 2=informational
    /**
     * Error message handler
     * @param {*} message 
     */
    $0: function(message) { console.error(message.substring(0, 5000)) }, 
    /**
     * Warning message handler
     * @param {*} message 
     */
    $1: function(message) { console.error(message.substring(0, 5000)) }, 
    /**
     * Informational message handler
     * @param {*} message 
     */
    $2: function(message) { if ($.config.debug) console.log(message) },


    //set defaults
    /**
     * Configuration items
     * @property {boolean} debug Whether to print debug messages to the console
     * @property {string} url Endpoint URL
     * @property {string} apikey API key
     * @property {string} secret API secret
     * @property {string} tenant Tenant
     * @property {string} username Username
     * @property {string} password Password
     * @property {string} proxy Proxy setting
     */
    config: {   
        /** Whether to print debug messages to the console */
        debug: true,     
        /** Endpoint URL */ 
        url: "https://api.ams.fortify.com",
        apikey: "",
        secret: "",
        tenant: "",
        username: "",
        password: "",
        /** Authentication token */
        token: "token",
        /** Proxy */
        proxy: "" //"http://127.0.0.1:8888"
    },


    //request method wraps request module into a Promise
    _request: null,
    /**
     * Wraps request module into a Promise
     * @param {any} options request.options
     * @param {string} label label used for identification in messages
     * @param {any} data form-data
     * @param {boolean} parse call JSON.parse(.body) upon resolve
     * @returns {Promise<any>} Promise with the results of the http request
     */
    request: function (options, label, data = null, parse = false) {
        if (this._request == null) {        //lazy init
            this._request = require("request");
            if ($.config.proxy.length > 0) this.agent = new require('https-proxy-agent')($.config.proxy);
        }
        if ($.config.proxy.length > 0) {
            options.agent = this.agent;
            options.rejectUnauthorized = false;
        }
        options.rejectUnauthorized = false
        options.requestCert = true
        
        return new Promise((resolve, reject) => {
            var n = label;
            var r = this._request(options, (error, response, body) => {
                if (error) {
                    $.$0(n + " " +error);
                    reject(error);
                }
                var s = response.statusCode;
                if ((s >= 200)&&(s <= 299)) {     
                    $.$2(`${n}.statusCode: ${s}`);
                    resolve(parse ? JSON.parse(response.body) : response.body);
                } else {
                    $.$1(`${n}.statusCode = ${s}`);
                    $.$1(`${n}.body = ${JSON.stringify(response)}`);
                    reject(response);
                }
            });
            $.$2(`${n} requested.`);
            if (data!=null) {       //used to push form-data if necessary
                data.pipe(r);
                $.$2(`${n} piped.`);
            }
        });
    }
}
module.exports = {
    /**
     * Configuration items
     * @property {boolean} debug Whether to print debug messages to the console
     * @property {string} url Endpoint URL
     * @property {string} apikey API key
     * @property {string} secret API secret
     * @property {string} tenant Tenant
     * @property {string} username Username
     * @property {string} password Password
     * @property {string} proxy Proxy setting
     */
    get config() {
        return $.config;
    },
    set config(value) {
        if (typeof value !== "undefined") {
            Object.keys(value).forEach(function(key,index) {
                if (typeof $.config[key] !== "undefined") $.config[key]=value[key];
            });
        }
    }
}

const logon = async function(force, label, options) {
    if (($.logon!=null) && ($.logon instanceof Promise) && !force) return $.logon
    $.logon = new Promise((resolve, reject) => {
        var n = label;
        $.$2(n + '.request()');
        var o = options
        $.$2(o);
        var l = $.request(o, n, null, true);
        Promise.all([l]).then(function(l){ 
            $.token = l[0]["access_token"]
            $.$2(`token: '${$.token}'`);
            resolve($.token);
        }).catch((error)=>{ error = error.body||error; $.$0("error"+error); reject(error); })
    });
    return $.logon;
}

/**
 * Module for Authenication
 */
const authenticate = {
    /**
    * Logon to Fortify-on-Demand
    * @param {boolean} force force new logon (default=false)
    * @param {string} tenant Tenant
    * @param {string} username Username
    * @param {string} password Password
    * @returns {Promise<any>} Results of the logon request
    */
    byPassword:  async function(force = false, tenant = $.config.tenant, username = $.config.username, password = $.config.password) {
        var options = {
            method: 'POST',
            url: `${$.config.url}/oauth/token`,
            body: new URLSearchParams({"grant_type":"password","scope":"api-tenant","security_code":"","password":`${password}`,"username":`${tenant}`+"\\"+`${username}`}).toString(),
            headers: {"Content-Type": "application/x-www-form-urlencoded"}
        }
        return logon(force, "authenticate.byPassword", options)
    },
    /**
    * Logon to Fortify-on-Demand
    * @param {boolean} force force new logon (default=false)
    * @param {string} apikey API key
    * @param {string} secret API secret
    * @returns {Promise<any>} Results of the logon request
    */
    bySecret:  async function(force = false, apikey = $.config.apikey, secret = $.config.secret) {
        var options = {
            method: 'POST',
            url: `${$.config.url}/oauth/token`,
            body: new URLSearchParams({"grant_type":"client_credentials","scope":"api-tenant","client_id":`${apikey}`,"client_secret":`${secret}`}).toString(),
            headers: {"Content-Type": "application/x-www-form-urlencoded"}
        }
        return logon(force, "authenticate.byPassword", options)
    }
}
module.exports.authenticate = authenticate



/**
 * Module for individual scans
 */
const scan = {
    /**
     * Get summary for a particular scan
     * @param {int} id scan id
     * @param {string} token token
     */
    getSummary: async function (id, token = $.token) {
        var n = "scan-summary";
        $.$2(n + `.request(${id})`);
        var o = {
            method: 'GET',
            url: `${$.config.url}/api/v3/scans/${id}/summary`,
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`}
        }
        return $.request(o, n, null, true);
    },
    /**
     * Get manifest for a particular scan
     * @param {int} id scan id
     * @param {string} token token
     */
    getManifest: async function (id, token = $.token) {
        var n = "scan-manifest";
        $.$2(n + `.request(${id})`);
        var o = {
            method: 'GET',
            url: `${$.config.url}/api/v3/scans/${id}/manifest`,
            headers: { "Authorization": `Bearer ${token}`}
        }
        return $.request(o, n, null, false);
    }
}
module.exports.scan = scan


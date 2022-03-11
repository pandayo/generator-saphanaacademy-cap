const express = require('express');
const app = express();
const bodyParser = require('body-parser');

const xsenv = require('@sap/xsenv');
xsenv.loadEnv();
const services = xsenv.getServices({
<% if(authentication || api){ -%>
    uaa: { tag: 'xsuaa' }
<% } -%>
<% if(multiTenant){ -%>
<% if(authentication || api){ -%>
    ,
<% } -%>
    registry: { tag: 'SaaS' }
    ,
    sm: { label: 'service-manager' }
<% } -%>
<% if (hana && !multiTenant){ -%>
<% if(authentication || api){ -%>
    ,
<% } -%>
    hana: { tag: 'hana' }
<% } -%>
});

<% if(hana){ -%>
const hdbext = require('@sap/hdbext');
<% if(multiTenant){ -%>
const lib = require('./library');
<% } -%>
<% if(attributes === false && multiTenant === false){ -%>    
// placed before authentication - business user info from the JWT will not be set as HANA session variables (XS_)
app.use(hdbext.middleware(services.hana));
<% } -%>
<% } -%>

<% if(authentication){ -%>
const xssec = require('@sap/xssec');
const passport = require('passport');
passport.use('JWT', new xssec.JWTStrategy(services.uaa));
app.use(passport.initialize());
app.use(passport.authenticate('JWT', {
    session: false
}));
<% } -%>

<% if(hana && attributes && multiTenant === false){ -%>    
// placed after authentication - business user info from the JWT will be set as HANA session variables (XS_)
app.use(hdbext.middleware(services.hana));
<% } -%>

app.use(bodyParser.json());

// app home
app.get('/srv2', function (req, res) {
<% if(authorization){ -%>
    if (req.authInfo.checkScope('$XSAPPNAME.Viewer')) {
<% } -%>
        res.status(200).send('<%= projectName %>');
<% if(authorization){ -%>
    } else {
        res.status(403).send('Forbidden');
    }
<% } -%>
});

<% if(authentication){ -%>
// app user info
app.get('/srv2/info', function (req, res) {
<% if(authorization){ -%>
    if (req.authInfo.checkScope('$XSAPPNAME.Viewer')) {
<% } -%>
        let info = {
            'userInfo': req.user,
            'subdomain': req.authInfo.getSubdomain()
<% if(multiTenant){ -%>
            ,
            'tenantId': req.authInfo.getZoneId()
<% } -%>
        };
        res.status(200).json(info);
<% if(authorization){ -%>
    } else {
        res.status(403).send('Forbidden');
    }
<% } -%>
});
<% } -%>

<% if(api){ -%>
// app destination
const core = require('@sap-cloud-sdk/core');
<% if(authentication){ -%>
const { retrieveJwt } = require('@sap-cloud-sdk/core');
<% } -%>
app.get('/srv2/dest', async function (req, res) {
<% if(authorization){ -%>
    if (req.authInfo.checkScope('$XSAPPNAME.Viewer')) {
<% } -%>
        try {
            let res1 = await core.executeHttpRequest(
                {
                    destinationName: req.query.destination || ''
<% if(authentication){ -%>
                    ,
                    jwt: retrieveJwt(req)
<% } -%>
                },
                {
                    method: 'GET',
                    url: req.query.path || ''
                }
            );
            res.status(200).json(res1.data);
        } catch (err) {
            console.log(err.stack);
            res.status(500).send(err.message);
        }
<% if(authorization){ -%>
    } else {
        res.status(403).send('Forbidden');
    }
<% } -%>
});
<% } -%>

<% if(hana){ -%>
// app database
app.get('/srv2/database', async function (req, res) {
<% if(authorization){ -%>
    if (req.authInfo.checkScope('$XSAPPNAME.Viewer')) {
<% } -%>
<% if(multiTenant){ -%>
        // tenant data
        let tenantId = req.authInfo.getZoneId();
        let sqlstmt = 'SELECT * FROM CATALOGSERVICE_SALES';
        /*
        // tenant metadata
        let tenantId = 'TENANT-' + req.authInfo.getZoneId() + '-META';
        let sqlstmt = 'SELECT * FROM TENANT_METADATA';
        // MTX metadata (all tenants)
        let tenantId = '__META__';
        let sqlstmt = 'SELECT * FROM TENANT_UPDATES';
        */
        // get DB instance
        let serviceBinding = await lib.getSMInstance(services.sm, tenantId);
        if (!serviceBinding.hasOwnProperty('error')) {
            // connect to DB instance
            let hanaOptions = serviceBinding.credentials;
            hdbext.createConnection(hanaOptions, function (err, db) {
                if (err) {
                    console.log(err.message);
                    res.status(500).send(err.message);
                    return;
                }
                // query
                db.exec(sqlstmt, function (err, results) {
                    if (err) {
                        console.log(err.message);
                        res.status(500).send(err.message);
                        return;
                    }
                    res.status(200).json(results);
                });
            });
        } else {
            res.status(500).send(serviceBinding);
        }
<% } else { -%>
        let sql = 'SELECT * FROM "CATALOGSERVICE_SALES"';
        req.db.exec(sql, function (err, results) {
            if (err) {
                res.type('text/plain').status(500).send('ERROR: ' + err.toString());
                return;
            }
            res.status(200).json(results);
        });
<% } -%>
<% if(authorization){ -%>
    } else {
        res.status(403).send('Forbidden');
    }
<% } -%>
});
<% } -%>

const port = process.env.PORT || 5002;
app.listen(port, function () {
    console.info('Listening on http://localhost:' + port);
});
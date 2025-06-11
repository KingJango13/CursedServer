const http = require("http");
const fs = require("fs");
const {fetch} = require("node-fetch");

function hasOwn(o, p) {
    return Object.prototype.hasOwnProperty.call(o, p);
}

const BROWSER_ICON_NAMES = [
    "android-chrome-192x192.png",
    "android-chrome-512x512.png",
    "apple-touch-icon.png",
    "favicon.ico",
    "favicon-16x16.png",
    "favicon-32x32.png"
];

/**
 * 
 * @param {string} path 
 * @param {object} params 
 * @returns {Promise<any>}
 */
async function igWebAPIGet(path, params = {}, headers = {}) {
    var query = new URLSearchParams(params).toString();
    if(path[0] !== "/") {
        path = "/" + path;
    }
    if(path[path.length - 1] !== "/"){
        path += "/";
    }
    var url = "https://www.instagram.com/api/v1" + path;
    if(query !== ""){
        url += "?" + query;
    }
    /**
     * @type {Response}
     */
    var res;

    var reqHeaders = {
        "user-agent": "Instagram 76.0.0.15.395 Android (24/7.0; 640dpi; 1440x2560; samsung; SM-G930F; herolte; samsungexynos8890; en_US; 138226743)",
        "x-ig-app-id": "936619743392459"
    }
    Object.assign(reqHeaders, headers);

    try {
        res = await fetch(url, {
            headers: reqHeaders
        });
    } catch (error) {
        console.error(error);
        return null;
    }
    if(!res.ok) {
        console.error(`Encountered error ${res.status}: ${res.statusText}\n`);
        return null;
    }
    var data = await res.json();
    return data;
}

async function getIGUserInfo(username) {
    var responseObject = await igWebAPIGet("/users/web_profile_info", {
        username
    });
    if(responseObject === null){
        console.error("Unable to find user " + username);
        return null;
    }
    return responseObject.data.user;
}

let imageRoutes = {};

http.createServer(function(req, res) {
    console.log(req.url);
    if(req.url == "/") {
        res.write("Hello, Internet!");
        res.end();
        return;
    }
    let pathArray = req.url.substring(1).split("/");
    if(BROWSER_ICON_NAMES.includes(pathArray[0])) {
        if(!fs.existsSync("./" + pathArray[0])) {
            res.write("File does not exist");
            res.end();
            return;
        }
        fs.readFile("./" + pathArray[0], function(error, data) {
            if(error) {
                console.error(error);
                res.write("Error loading " + pathArray[0]);
                res.end();
                return;
            }
            res.write(data);
            res.end();
        });
        return;
    }
    let queryIndex = req.url.indexOf("?");
    let hasQuery = queryIndex > 0;
    let query = null;
    if(hasQuery) {
        pathArray[pathArray.length - 1] = pathArray[pathArray.length - 1].split("?")[0];
        query = {};
        for(let keyPair of req.url.substring(queryIndex + 1).split("&")) {
            let pair = keyPair.split("=");
            query[decodeURI(pair[0])] = decodeURI(pair[1]);
        }
    }
    if(pathArray[0] == "jango.js") {
        fetch("https://raw.githubusercontent.com/KingJango13/JangoJS/refs/heads/main/index.js").then(function(jsData) {
            jsData.text().then(function(jsText) {
                res.writeHead(200, {"content-type": "application/javascript"});
                res.write(jsText);
                res.end();
            });
        }, function(reasonForRejection) {
            res.writeHead(200, {"content-type": "application/javascript"});
            res.write('console.error("Unable to fetch JangoJS");console.error("' + reasonForRejection + '");');
            res.end();
        });
        return;
    }
    if(pathArray[0] == "add") {
        if(!hasQuery) {
            res.write("Error: No query");
            res.end();
            return;
        }
        if(hasOwn(query, "a") && hasOwn(query, "b")) {
            try {
                let a = parseFloat(query.a);
                let b = parseFloat(query.b);
                res.write((a + b).toString());
            } catch(e) {
                res.write("Error: either a (" + query.a + ") or b (" + query.b + ") is not a number");
            }
            res.end();
            return;
        }
    }
    if(pathArray[0] == "image") {
        if(hasOwn(imageRoutes, pathArray[1])) {
            fetch(imageRoutes[pathArray[1]]).then(async function(imgData) {
                res.write(new Uint8Array(await imgData.arrayBuffer()));
                res.end();
            });
        } else {
            res.write("Unknown Image");
            res.end();
        }
    }
    if(pathArray[0] == "igscraper") {
        if(!hasQuery || query.username == null) {
            res.writeHead(400, {"content-type": "application/json"});
            res.write('{"error":"No user specified"}');
            res.end();
            return;
        }
        getIGUserInfo(query.username).then(function(user) {
            if(user == null) {
                res.writeHead(500, {"content-type": "application/json"});
                res.write('{"error":"Specified user does not exist"}');
                res.end();
                return;
            }
            res.writeHead(200, {"content-type": "application/json"});
            user.jango_data = {
                post_images: []
            };
            let userPostsRaw = user.edge_owner_to_timeline_media.edges;
            for(let post of userPostsRaw) {
                post = post.node;
                if(post.__typename == "GraphSidecar") {
                    let displayImageID = crypto.randomUUID();
                    let postData = {
                        display: displayImageID,
                        children: []
                    };
                    imageRoutes[displayImageID] = post.display_url;
                    for(let child of post.edge_sidecar_to_children.edges) {
                        child = child.node;
                        let childID = crypto.randomUUID();
                        postData.children.push(childID);
                        imageRoutes[childID] = child.display_url;
                    }
                    user.jango_data.post_images.push(postData);
                } else {
                    let displayImageID = crypto.randomUUID();
                    imageRoutes[displayImageID] = post.display_url;
                    user.jango_data.post_images.push({display: displayImageID});
                }
            }
            res.write(JSON.stringify(user));
            res.end();
        });
        return;
    }
}).listen(8080);
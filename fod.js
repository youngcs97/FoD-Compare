'use strict';

async function fetchScans(ids) {
    let t = await fod.authenticate.bySecret()     //Authenticate (must be done synchronously before other REST calls)
    var x = {"id": ids}  // Scan Id's to capture
    var s = []  // holds the summary results
    var m = []  // holds the manifest results
    x.id.forEach(id => {
        s.push(fod.scan.getSummary(id))
        m.push(fod.scan.getManifest(id))
    });
    var a = []  // Promise container to make sure both summaries and manifests fetches have all completed
    a.push(Promise.all(s).then(v => {   // Summaries Promise wrapper - once all are fetched, compare for differences
        x["data"]=v
        x["differences"] = differences(v)
    }))
    a.push(Promise.all(m).then(v => {   // Manifests Promise wrapper - once all are fetched, parse and merge results
        for (var i=0; i<v.length; i++) {
            v[i]=parse(v[i])
        }
        x["manifest"]=merge(v)
    }))
    Promise.all(a).then(v => {  // Once all fetches are done, export to json and excel
        const fs = require('fs')
        fs.writeFileSync("differences.json", JSON.stringify(x))

        var xl = require('excel4node');     // Excel builder
        var wb = new xl.Workbook();
        var ws = wb.addWorksheet('Differences');    // Write differences to tab1
        ws.cell(1,1).string("Property")
        var j = 2
        Object.keys(x.differences).forEach(k => {   // iterate through keys
            for (var i=0; i<x.id.length; i++) {
                if (i==0) ws.cell(j,1).string(`${k}`)
                if (j==2) ws.cell(1,i+2).string(`ScanId: ${x.id[i]}`)
                var v = x.differences[k][i] // cell value
                var cl = ws.cell(j,i+2)
                if (v!=null) {
                    switch (typeof(v)) {
                        case "number": cl.number(v); break;
                        case "string": cl.string(v); break;
                        default: cl.string(typeof(v))   // this is non-string or non-number
                    }
                }
            }
            j++
        })
        var ws = wb.addWorksheet('Manifest');   // Write manifest to tab2
        ws.cell(1,1).string("Path")
        var j = 2
        Object.keys(x.manifest).forEach(k => {  // key iterator
            for (var i=0; i<x.id.length; i++) {
                if (i==0) ws.cell(j,1).string(`${k}`)
                if (j==2) {
                    ws.cell(1,i+2).string(`Sz: ${x.id[i]}`)     // We've got 2 sets of columns times # of ids (2*id.length)
                    ws.cell(1,i+x.id.length+2).string(`Dt: ${x.id[i]}`)
                }
                for (var l=0; l<2; l++) {   // column sets with l loop
                    var n = i+x.id.length*l
                    var v = x.manifest[k][n]
                    var cl = ws.cell(j,n+2)
                    if (v!=null) {
                        switch (typeof(v)) {
                            case "number": cl.number(v); break;
                            case "string": cl.string(v); break;
                            default: cl.string(typeof(v))
                        }
                    }
                }
            }
            j++
        })
        wb.write("differences.xlsx")
    })
}

function differences(summary, prefix="") {
    var r = {}
    var x = summary[0]  // work through keys of first summary object
    if (x!=null) {
        Object.keys(x).forEach(k => {   // loop over all properties
            var v = []
            var m = true    // set match flag as true
            var l = x[k]    // initial item property value
            summary.forEach(s => {  // for each key, check if all values match
                v.push(s[k])
                if (s[k]!=l) m = false  // any value not matching flags to false
            })
            if (typeof(l)!="object") {  // if the property is not an "object" type (i.e. is a primitive, check to see if all values match)
                if (!m) r[`${prefix}${k}`]=v    // add to differences if match was flagged as false
            } else {
                var z = differences(v, `${prefix}${k}.`)    // for properties that are an object (child object), recurse through child properties
                Object.keys(z).forEach(w => {
                    r[w]=z[w]   // prefix makes sure to perpetuate the property names with dots
                })
            }
        })
    }
    return r
}
function parse(manifest) {  // parses manifests in the format:  "<filepath>" size date
    var r = []
    var l = manifest.trim().split("\n") // split into lines on linefeed char
    for (var i=0; i<l.length; i++) {
        var f = l[i].match(/(".*?"|[^"\s]+)(?=\s*|\s*$)/g); // regex to ignore doublequoted text and split on whitespace as delimiters
        f[0]=f[0].slice(1,-1)   // slice off doublequotes from first item
        f[1]=Number(f[1])   // turn second field into a number
        r.push(f)
    }
    return r
}
function merge(manifests) {
    var r = {}
    var i = 0;
    for (var i=0; i<manifests.length; i++) {    // loop through manifests
        manifests[i].forEach(l => {     // loop through lines within manifest
            var p = l[0]    // first item of array is the path -- functions as keyname
            if (r[p]==null) r[p] = new Array((manifests.length*2)).fill(null)   // if key not present yet, initialize array of nulls
            r[p][i]=l[1]    // keep all field 1's (size?) together
            r[p][(manifests.length+i)]=l[2] // keep all field 2's (date) together
        })
    }
    return r
}

const fod = require("./fod-api.js");    //include CommonJS module+
fod.config = require("./.config.json")  ///load the configuration from JSON (be sure to edit for your settings)


// Fetch comparisons of these scans
fetchScans([6395564, 6395413, 6386441])
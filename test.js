#!/usr/bin/env node
const linkedInLearningDownloader = require('./downloader.js')

const fs = require('fs')
const params = JSON.parse(fs.readFileSync('./params.json'))

const downloader = linkedInLearningDownloader()
downloader.downloadCourses(params)
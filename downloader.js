const fs = require('fs')
const puppeteer = require('puppeteer')
const axios = require('axios')
const decodeHTML = require('unescape')
const _ = require('lodash')

const LinkedInLearningDownloader = () => {

    let browser = null
    let page = null

    const timeout = ms => new Promise(res => setTimeout(res, ms))
    const makeFileSystemSafe = str => str.replace(/ ?[/\\:|>] ?/g, ' - ').replace(/[/\\?%"*<]/g, '')

    async function scrollToBottom(page) {
        await page.evaluate(async () => {
            await new Promise((resolve, reject) => {
                var totalHeight = 0;
                var distance = 100;
                var timer = setInterval(() => {
                    var scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance)
                    totalHeight += distance
                    if(totalHeight >= scrollHeight) {
                        clearInterval(timer)
                        resolve()
                    }
                }, 100)
            })
        })
    }

    async function openBrowserPage() {
        try {
            const width = 1600
            const height = 900
            browser = await puppeteer.launch({
                headless: true,
                args: [`--window-size=${width},${height}`]
            })
        
            page = await browser.newPage()
            await page.setViewport({width, height})
        } catch(err) {
            console.error(`Unexpected error while launching browser : ${err}`)
            throw err
        }
    }

    async function login(user, password) {
        try {
            const loginPageURL = 'https://www.linkedin.com/learning-login/'
            await page.goto(loginPageURL)
            await page.type('#auth-id-input', user)
            await Promise.all([
                page.click('#auth-id-button'),
                page.waitForNavigation()
            ])
            await page.type('#password', password)
            await Promise.all([
                page.click('.login__form_action_container button'),
                page.waitForNavigation()
            ])
        } catch(err) {
            console.error(`Unexpected error while logging in : ${err}`)
            throw err
        }
    }

    function getItemsToDownloadFromList(itemsURLs) {
        // trim 'https://linkedin.com/learning/' as well as GET arguments
        const items = itemsURLs.map(url => url.replace(/.*\/learning\/([^?]*).*/, '$1'))
        return {
            allSaved :          items.some(e => e.match(/me\/saved.*/))         ,
            allCompleted :      items.some(e => e.match(/me\/completed.*/))     ,
            allInProgress :     items.some(e => e.match(/me\/in-progress.*/))   ,
            collections :       items.filter(e => e.match(/collections\/.*/))   ,
            paths :             items.filter(e => e.match(/paths\/.*/))         ,
            individualCourses : items.filter(e => !e.match(/^(me\/|paths\/|collections\/)/)).map(e => e.replace(/([^\/]*).*/, '$1'))
        }
    }

    async function getAllSavedCourses() {
        await page.goto(`https://www.linkedin.com/learning/me/saved`)
        await timeout(2000)
        // scroll to the bottom to load all courses
        await scrollToBottom(page)
        return await page.$$eval('a.entity-link[data-control-name="card_title"]',
            a => a.map(e => e.href.replace(/.*\/learning\/([^\/?]*).*/, '$1')))
    }

    async function getCoursesFromCollection(collection) {
        await page.goto(`https://www.linkedin.com/learning/${collection}`)
        await timeout(2000)
        // scroll to the bottom to load all courses
        await scrollToBottom(page)
        return await page.$$eval('a.entity-link__link[data-control-name="collection_card"]',
            a => a.map(e => e.href.replace(/.*\/learning\/([^\/?]*).*/, '$1')))
    }

    async function getAllInProgressCourses() {
        await page.goto(`https://www.linkedin.com/learning/me/in-progress`)
        await timeout(2000)
        // scroll to the bottom to load all courses
        await scrollToBottom(page)
        // click on each collapsed learning paths to expand them
        const collapsedPaths = await page.$$('.lls-card-child-content__button>span')
        for(const collapsedPath of collapsedPaths) {
            await collapsedPath.click()
        }
        // get all course names (excluding learning path roots)
        return await page.$$eval('a.card-entity-link[data-control-name="card_title"]',
            a => a.map(e => e.href.replace(/.*\/learning\/([^\/?]*).*/, '$1')).filter(e => e!='paths'))
    }

    async function getAllCompletedCourses() {
        await page.goto(`https://www.linkedin.com/learning/me/completed`)
        await timeout(2000)
        // scroll to the bottom to load all courses
        await scrollToBottom(page)
        // click on each collapsed learning paths to expand them
        const collapsedPaths = await page.$$('.lls-card-child-content__button>span')
        for(const collapsedPath of collapsedPaths) {
            await collapsedPath.click()
        }
        // get all course names (excluding learning path roots)
        return await page.$$eval('a.card-entity-link[data-control-name="card_title"]',
            a => a.map(e => e.href.replace(/.*\/learning\/([^\/?]*).*/, '$1')).filter(e => e!='paths'))
    }

    async function getPathStructure(path) {

        await page.goto(`https://www.linkedin.com/learning/${path}`)
        await timeout(2000)

        const title = await page.$eval('.path-layout__header-main h1', h1 => h1.textContent.trim())
        const startButton = await page.$('button[data-control-name="start_learning_path"]')
        if(startButton) {
            // The learning path was not started yet, we have to start it before having the list of a elements
            await page.click('button[data-control-name="start_learning_path"]')
            await timeout(2000)
        }

        const courseURLs = await page.$$eval('a.entity-link__link[data-control-name="path_card_title"]',
            l => l.map(a => a.href.replace(/.*\/learning\/([^\/?]*).*/, '$1')))

        const courseTitles = await page.$$eval('.lls-card-headline',
            l => l.map(span => span.textContent.trim()))

        return {
            title,
            courses : courseURLs.map((courseURL, i) => ({url: courseURL, title: courseTitles[i]}))
        }
    }

    async function getCourseStructure(course) {
        try {
            // Go to course page
            await page.goto(`https://www.linkedin.com/learning/${course}`)
            await timeout(2000)
            // If content navbar is collapsed, expand it
            const contentSidebar = await page.$('.classroom-sidebar-toggle--open')
            if(contentSidebar === null) {
                await contentSidebar.click()
            }
            // Get course full name
            const courseTitle = makeFileSystemSafe(decodeHTML(await page.$eval('.classroom-nav__details h1', el => el.textContent.trim())))
            
            // Click on each collapsed chapter to expand them
            const collapsedChapters = await page.$$('.classroom-toc-chapter--collapsed')
            for(const collapsedChapter of collapsedChapters) {
                await collapsedChapter.click()
            }
            // Store the chapter/lesson tree structure

            const HTMLStructure = await page.evaluate(() => [...document.querySelectorAll('.classroom-toc-chapter')]
                .map((chapter, chapterId) => ({
                    title: chapter.querySelector('.classroom-toc-chapter__toggle-title').innerHTML,
                    lessons: [...chapter.querySelectorAll('.classroom-toc-item__link')]
                        .map(lesson => ({
                            url: lesson.href,
                            title: lesson.querySelector('.classroom-toc-item__title').childNodes[1].textContent
                        }))
                }))
            )

            const chapters = HTMLStructure
                .map((chapter, chapterId) => ({
                    title: makeFileSystemSafe(decodeHTML(chapter.title.trim()
                            .replace(/(Introduction)/, '0. $1')             // 'Introduction' and 'Conclusions' lessons have no number
                            .replace(/(Conclusion)/, chapterId + '. $1')    // so we add one (resp. 0 and last number + 1)
                    )),
        
                    lessons: chapter.lessons
                        .map(lesson => ({
                            ...lesson,
                            title: makeFileSystemSafe(decodeHTML(lesson.title.trim()))
                        }))
                        .filter(lesson => !lesson.url.includes('learningApiAssessment'))    // ignore interactive quizz
                }))

            return {title:courseTitle, chapters}
        }
        catch(err) {
            console.error(`Unexpected error while fetching chapter list of course ${course} : ${err}`)
            return null
        }
    }

    async function downloadLesson(lesson, output) {
        try {
            // Get video uri (if we find no uri, we retry up to 5 times to reload the page)
            let uri = null, tryCount = 0
            for(uri = null, tryCount = 0; uri === null && tryCount < 5; tryCount++) {
                // Go to lesson page
                await Promise.all([
                    page.goto(lesson.url),
                    page.waitForNavigation({ waitUntil: 'domcontentloaded' })
                ])
                // Get video uri
                uri = await page.evaluate(() => {
                    let src = document.querySelector('.vjs-tech')
                    return (src ? src.src : null)
                })
                if(uri == null && tryCount < 5) {
                    console.warn(`Trouble fetching video uri for '${lesson.title}' : retrying`)
                    await timeout(4000)
                }
            }
            if(uri == null) {
                console.warn(`Could not fetch video uri for ${lesson.title} : skipped !`)
                retryCount = 0
                return false
            }
            // Download video
            const writer = fs.createWriteStream(output)
            const response = await axios({url: uri, method: 'GET', responseType: 'stream', timeout: 5*1000})
            response.data.pipe(writer)
            try {
                await Promise.race([
                    new Promise((resolve, reject) => {
                        writer.on('finish', resolve)
                        writer.on('error', reject)
                    }),
                    timeout(3*60*1000).then(()=>{throw new Error('Download timeout')}) // retry downloading after 3 minutes
                ])
            } catch(err) {
                console.info(`Timeout while downloading lesson '${lesson.title}'`)
                return false
            }
            console.info(` '${output.replace(/.*\/[^\/]*\/([^\/]*\/[^\/]*)/, '$1')}' downloaded.`)
            return true
        }
        catch(err) {
            console.error(`Unexpected error while downloading lesson '${lesson.title}' : ${err}`)
            return false
        }
    }

    // Public exports

    async function downloadCourses({user, password, items, includeExerciseFiles, includeTranscripts, outputFolder}) {
        try {
            // Log in
            console.info(`Launching browser...`)
            await openBrowserPage()
            console.info(`Logging in...`)
            await login(user, password)
            
            console.info(`Getting structure of items to download...`)
            // Get structure of items to download
            const {
                individualCourses,                      // individual courses
                paths, collections,                     // specific public learning paths and personal collections of courses
                allSaved, allCompleted, allInProgress   // whether to include personal My Learning saved/completed/in progress courses
            } = getItemsToDownloadFromList(items)
            
            // Output a text file with course list for each path
            fs.mkdirSync(outputFolder, {recursive:true})
            const pathStructures = await paths.reduce(async (l, path) => {
                return [...await l, await getPathStructure(path)]
            }, Promise.resolve([]))

            pathStructures.forEach(path => {
                fs.writeFileSync(`${outputFolder}/${path.title}.txt`,
                    path.title + path.courses.reduce((str, course, i) => `${str}\n ${i+1}. ${course.title}`, ''))
            })
            
            // Get all the nested courses to download from items
            const allCourses = [
                ...individualCourses,
                //..._.flatten(paths.map(path => getCoursesFromPath(path)))
                //...pathStructures.map(p => _.flatMap(p.courses, c => c.url)),
                ..._.flatMap(pathStructures, p => p.courses.map(c => c.url)),
                ...await collections.reduce(async (l, c) => [...await l, ...await getCoursesFromCollection(c)], Promise.resolve([])),
                ...(allSaved ? await getAllSavedCourses() : []),
                ...(allCompleted ? await getAllCompletedCourses() : []),
                ...(allInProgress ? await getAllInProgressCourses() : [])
            ]
            const distinctCourses = _.uniq(allCourses)
            console.info(`About to download ${distinctCourses.length} courses.`)

            // Download courses
            let skipCount = 0
            for(const course of distinctCourses) {

                // Fetching course structure
                let structure = null, retryCount = 0
                do {
                    retryCount++
                    structure = await getCourseStructure(course)
                    if(structure === null && retryCount < 5) {
                        console.warn(`Trouble getting course structure for '${course}' : retrying`)
                        timeout(2000)
                    }
                } while(structure === null && retryCount < 5)
                if(structure === null) {
                    console.warn(`<!!!> Could not get course structure for '${course}' : skipped !`)
                    skipCount++
                    continue
                }
                console.info(`\n[ ${structure.title} ]`)
                const courseTitle = structure.title
                for(const chapterId in structure.chapters) {
                    const chapter = structure.chapters[chapterId]
                    
                    // Create chapter folder
                    const chapterPath = `${outputFolder}/${courseTitle}/${chapter.title}`
                    !fs.existsSync(chapterPath) && fs.mkdirSync(chapterPath, {recursive:true})
                    
                    for(let lessonId = 0; lessonId < chapter.lessons.length; ++lessonId) {
                        const lesson = chapter.lessons[lessonId]
                        // Ignore lesson if already exists on disk
                        const lessonFullPath = `${chapterPath}/${lessonId+1}. ${lesson.title}.mp4`
                        if(fs.existsSync(lessonFullPath) && fs.statSync(lessonFullPath).size > 200000) {
                            continue
                        }
                        // Try download lesson
                        let ok = false
                        retryCount = 0
                        do {
                            retryCount++
                            ok = await downloadLesson(lesson, lessonFullPath)
                            if(!ok && retryCount < 5) {
                                console.warn(`Trouble downloading video for '${lesson.title}' : retrying`)
                                timeout(2000)
                            }
                        } while(!ok && retryCount < 5)
                        if(!ok) {
                            console.warn(`<!!!> Could not download video for ${lesson.title} : skipped !`)
                            skipCount++
                            continue
                        }
                    }
                }
            }
            await browser.close()

            if(skipCount === 0) {
                console.info(`\n${distinctCourses.length} courses succesfully downloaded !`)
            } else {
                console.warn(`\n<!!!> Download is finished but ${skipCount} videos could not be downloaded !`)
            }
        }
    
        catch(err) {
            console.error(`Unexpected error : ${err}`)
            await browser.close() 
        }
    
    }

    return {
        downloadCourses
    }

}

module.exports = LinkedInLearningDownloader

// TODO Bugs
// - sometimes video download is stuck forever, promise never resolve
// - sometimes : Unexpected error while downloading lesson <> : Error: Navigation failed because browser has disconnected!
// - sometimes : TimeoutError: Navigation timeout of 30000 ms exceeded
// - sometimes : Error: Protocol error (Page.navigate): Session closed. Most likely the page has been closed.
// - sometimes : ERR: INTERNET DISCONNECTED

// TODO Features
// - create a CLI (and download from a list of course names in csv)
// - download transcripts
// - download exercise files

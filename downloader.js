const fs = require('fs')
const puppeteer = require('puppeteer')
const axios = require('axios')

const LinkedInLearningDownloader = () => {

    let browser = null
    let page = null

    const timeout = ms => new Promise(res => setTimeout(res, ms))
    
    async function openBrowserPage() {
        try {
            const width = 1600
            const height = 900
            browser = await puppeteer.launch({
                headless: true,
                args: [`--window-size=${width},${height}`]
            })
        
            page = await browser.newPage();
            await page.setViewport({width, height});
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
                page.click('[data-control-urn="login-submit"]'),
                page.waitForNavigation()
            ]);
        } catch(err) {
            console.error(`Unexpected error while logging in : ${err}`)
            throw err
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
            const courseTitle = await page.evaluate(() => document
                .querySelector('.classroom-nav__details h1')
                .textContent
                .trim()
                .replace(/[/\\:|>] ?/g, ' - ') // make name file-system safe
                .replace(/[/\\?%"*<]/g, '')
            )
            // Click on each collapsed chapter to expand them
            const collapsedChapters = await page.$$('.classroom-toc-chapter--collapsed')
            for(const collapsedChapter of collapsedChapters) {
                await collapsedChapter.click()
            }
            // Store the chapter/lesson tree structure
            const chapters = await page.evaluate(() => [...document.querySelectorAll('.classroom-toc-chapter')]
                .map((chapter, chapterId) => ({
                    title: chapter
                            .querySelector('.classroom-toc-chapter__toggle-title')
                            .innerHTML
                            .trim()
                            .replace(/(Introduction)/, '0. $1')             // 'Introduction' and 'Conclusions' lessons have no number
                            .replace(/(Conclusion)/, chapterId + '. $1')    // so we add one (resp. 0 and last number + 1)
                            .replace(/[/\\:|>] ?/g, ' - ')                  // make name file-system safe
                            .replace(/[/\\?%"*<]/g, ''),
        
                    lessons: [...chapter.querySelectorAll('.classroom-toc-item-layout__link')]
                        .map(lesson => ({
                            url: lesson.href,
                            title: lesson.querySelector('.classroom-toc-item-layout__title')
                                .childNodes[1]
                                .textContent
                                .trim()
                                .replace(/[/\\:|>] ?/g, ' - ')              // make name file-system safe
                                .replace(/[/\\?%"*<]/g, '')
                        }))
                        .filter(lesson => !lesson.url.includes('learningApiAssessment'))    // ignore interactive quizz
                        
                }))
            )

            return {title:courseTitle, chapters}
        }
        catch(err) {
            console.error(`Unexpected error while fetching chapter list of course ${course} : ${err}`)
            throw err
        }
    }

    async function downloadLesson(lesson, output) {
        try {
            // Get video uri (if we find no uri, we retry up to 3 times to reload the page)
            let uri = null, tryCount = 0
            for(uri = null, tryCount = 0; uri === null && tryCount < 3; tryCount++) {
                // Go to lesson page
                await Promise.all([
                    page.goto(lesson.url),
                    page.waitForNavigation({ waitUntil: 'domcontentloaded' })
                ])
                // Get video uri
                uri = await page.evaluate(() => {
                    let src = document.querySelector('.vjs-tech');
                    return (src ? src.src : null)
                })
                if(uri == null && tryCount < 3) {
                    console.warn(`Trouble downloading video '${lesson.title}' ! Retrying...`)
                    await timeout(4000)
                }
            }
            if(uri == null) {
                console.warn(`Skipped unreachable video '${lesson.title}' !`)
                retryCount = 0
            }
            // Download video
            console.info(`Downloading to '${output}'...`)
            const writer = fs.createWriteStream(output)
            const response = await axios({url: uri, method: 'GET', responseType: 'stream', timeout: 5*1000})
            response.data.pipe(writer)
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve)
                writer.on('error', reject)
            })
        }
        catch(err) {
            console.error(`Unexpected error while downloading lesson ${lesson.title} : ${err}`)
            throw err
        }
    }

    // Public exports

    async function downloadCourses({user, password, courses, includeExerciseFiles, includeTranscripts, outputFolder}) {
        try {
            console.info(`Launching browser...`)
            await openBrowserPage()
            
            console.info(`Logging in...`)
            await login(user, password)
            console.info(`Logged in successfully !`)
            
            // Download courses
            for(const course of courses) {
                console.info(`Let's download course ${course}`)
                const structure = await getCourseStructure(course)
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
                        if(fs.existsSync(lessonFullPath)) {
                            console.info(`Skipped existing '${chapterId}/${lessonId+1}. ${lesson.title}'`)
                            continue
                        }
                        await downloadLesson(lesson, lessonFullPath)
                    }
                }
                
                // TODO Download exercise files and transcripts if asked
                /*if(includeExerciseFiles) {
                    await downloadExerciseFiles()
                }
                if(includeTranscripts) {
                    await downloadTranscripts()
                }*/
                console.info(`Finished downloading course ${course}`)
            }
            await browser.close()
        }
    
        catch(err) {
            console.error(`Unexpected error : ${err}`)
            await browser.close() 
        }
    
    }

    return {
        downloadCourses: downloadCourses
    }

}

module.exports = LinkedInLearningDownloader

// TODO Bugs
// - sometimes video download is stuck forever, promise never resolve
// - sometimes we have "TypeError: Cannot read property 'replace' of null"
// - close browser even when an error is thrown

// TODO Improvements
// - should consider not existing if file size < 500Kb
// - escape html in lesson title : for instance with "3. Using Edit &gt; Insert"

// TODO Features
// - allow full length course url as well as short course name in params
// - download all courses of a personal Collection
// - download all courses of the personal section 'Saved courses'
// - download a whole (or a list of) training path
// - create a CLI (and download from a list of course names in csv)
// - download transcripts
// - download exercise files

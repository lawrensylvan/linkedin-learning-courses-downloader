const fs = require('fs')
const puppeteer = require('puppeteer')
const axios = require('axios')

const timeout = ms => new Promise(res => setTimeout(res, ms))

const params = JSON.parse(fs.readFileSync('./params.json'))

// Launch browser
console.log('Launching browser...')
const width = 1600
const height = 900
const browser = await puppeteer.launch({
    headless: true,
    args: [`--window-size=${width},${height}`]
})

downloadCourses(params)

async function downloadCourses({user, password, courses, includeExerciseFiles, includeTranscripts, outputFolder}) {
    try {
        const page = await browser.newPage();
        await page.setViewport({width, height});

        // Log in
        console.log('Login in...')
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
        console.log('Logged in successfully !')

        // Download courses
        for(const course of courses) {
            console.log(`Let's download course ${course}`)

            // Go to course page
            await page.goto(`https://www.linkedin.com/learning/${course}`)
            await timeout(2000)

            // If content navbar is collapsed, expand it
            const contentSidebar = await page.$('.classroom-sidebar-toggle--open')
            if(contentSidebar === null) {
                console.log('It was collapsed')
                await contentSidebar.click()
            }
            
            // Click on each collapsed chapter to expand them
            const collapsedChapters = await page.$$('.classroom-toc-chapter--collapsed')
            
            for(const collapsedChapter of collapsedChapters) {
                await collapsedChapter.click()
            }

            // Store the chapter/lesson tree structure
            const structure = await page.evaluate(() => [...document.querySelectorAll('.classroom-toc-chapter')]
                .map((chapter, chapterId) => ({
                    name: chapter
                            .querySelector('.classroom-toc-chapter__toggle-title')
                            .innerHTML
                            .trim()
                            .replace(/(Introduction)/, '0. $1')
                            .replace(/(Conclusion)/, chapterId + '. $1'),

                    lessons: [...chapter.querySelectorAll('.classroom-toc-item-layout__link')]
                        .map(lesson => ({
                            url: lesson.href,
                            name: lesson.querySelector('.classroom-toc-item-layout__title').childNodes[1].textContent.trim()
                        }))
                        .filter(lesson => !lesson.url.includes('learningApiAssessment'))
                        
                }))
            )

            // Create output folder
            if(!fs.existsSync(outputFolder)) {
                fs.mkdirSync(outputFolder)
            }

            // Create course folder
            const coursePath = `${outputFolder}/${course}`
            if(!fs.existsSync(coursePath)) {
                fs.mkdirSync(coursePath)
            }
            
            for(const chapterId in structure) {
                const chapter = structure[chapterId]
                
                // Create chapter folder
                const chapterPath = `${coursePath}/${chapter.name}`
                if(!fs.existsSync(chapterPath)) {
                    fs.mkdirSync(chapterPath)
                }
                
                let retryCount = 0
                for(let lessonId = 0; lessonId < chapter.lessons.length; ++lessonId) {
                    const lesson = chapter.lessons[lessonId]
                    // Ignore lesson if already exists on disk
                    const lessonFullPath = `${chapterPath}/${lessonId+1}. ${lesson.name}.mp4`
                    if(fs.existsSync(lessonFullPath)) {
                        console.log(`Skipped existing '${chapterId}/${lessonId+1}. ${lesson.name}'`)
                        continue
                    }
                    // Go to lesson page
                    await Promise.all([
                        page.goto(lesson.url),
                        page.waitForNavigation({ waitUntil: 'domcontentloaded' })
                    ])
                    // Get video uri
                    const uri = await page.evaluate(() => {
                        let src = document.querySelector('.vjs-tech');
                        return (src ? src.src : null)
                    })
                    // If we find no uri, we retry up to 3 times to reload the page
                    if(uri == null) {
                        if(retryCount < 3) {
                            console.log(`Cannot reach '${chapterId}/${lessonId+1}. ${lesson.name}' ! Retrying...`)
                            retryCount++
                            lessonId--
                            await timeout(4000)
                            continue
                        }
                        else {
                            console.log(`Skipped unreachable '${chapterId}/${lessonId+1}. ${lesson.name}' !`)
                            retryCount = 0
                            continue
                        }
                    } else {
                        retryCount = 0
                    }
                    // Download video
                    console.log(`Downloading '${chapterId}/${lessonId+1}. ${lesson.name}'...`)
                    const writer = fs.createWriteStream(lessonFullPath)
                    const response = await axios({url: uri, method: 'GET', responseType: 'stream', timeout: 5*1000})
                    response.data.pipe(writer)
                    await new Promise((resolve, reject) => {
                        writer.on('finish', resolve)
                        writer.on('error', reject)
                    })

                }
            }
            
            // TODO Download exercise files and transcripts if asked
            /*if(includeExerciseFiles) {
                await downloadExerciseFiles()
            }
            if(includeTranscripts) {
                await downloadTranscripts()
            }*/
            console.log(`Finished downloading course ${course}`)
        }

        await browser.close()
    }

    catch(err) {
        console.error(`Error downloading videos : ${err}`)
        await browser.close() 
    }

}

// TODO Bugs
// - sometimes video download is stuck forever, promise never resolve
// - sometimes we have "TypeError: Cannot read property 'replace' of null"
// - close browser even when an error is thrown

// TODO Improvements
// - should consider not existing if file size < 500Kb
// - escape html in lesson title : for instance with "3. Using Edit &gt; Insert"
// - maybe ensure to have filesystem safe names ? (: is already changed in / on MacOS but still)

// TODO Features
// - download transcripts
// - download exercise files
// - download from a Collection
// - create a CLI (and download from a list of course names in csv)
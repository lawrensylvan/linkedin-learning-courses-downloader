# LinkedIn Learning Courses Downloader
A library and CLI to download LinkedIn learning courses using your LinkedIn Premium account

## How to use

- You need a valid and active LinkedIn Premium subscription
- You need to have Node.js installed

### Download dependencies

Go to the project directory using terminal & run

```sh
npm install
```

### Create a params.json file

```json
{
    "user": "your@email.com",
    "password": "yourpassword",
    "items": [
        "react-essential-training",
        "path/become-a-mern-stack-javascript-developer",
        "https://www.linkedin.com/learning/me/saved"
    ],
    "outputFolder": "./courses"
}
```

- Fill in your credentials
- Provide an array of items you wish to download. Each item is the URL (full or just last part) of either :

  - An **individual course** : `https://www.linkedin.com/learning/final-cut-pro-x-10-4-4-essential-training`

  - A **learning path** : `https://www.linkedin.com/learning/paths/become-a-mern-stack-javascript-developer`
    - All courses that are part of the learning path will be downloaded in the output folder with the other courses
    - Courses that are already part of the selection (i.e. included in another learning path) will not be downloaded again
    - As a reminder of the learning path content and order, a `.txt` file named after the learning path is outputed as well

  - A personal **collection** : `https://www.linkedin.com/learning/collections/6595573961260707840`
    - All courses that are part of the collection will be downloaded
    - If the collection includes an individual video (that is, only a part of the course), the whole course will be downloaded

  - The **Saved Courses** section of *My Learning*  : `https://www.linkedin.com/learning/me/saved`
    - All your saved courses (outside of any collection) will be downloaded

  - The **In Progress** section of *My Learning* : `https://www.linkedin.com/learning/me/in-progress`
    - All courses that are in progress, including those that are part of a learning path, will be downloaded

  - The **Learning History** section of *My Learning* : `https://www.linkedin.com/learning/me/completed`
    - All completed courses will be downloaded

### Run to download courses

```sh
$ npm start
```

If one of the courses or one of the courses' lessons already exists in the output path, it is not re-downloaded.

There is a 3-retries mechanism to deal with unavailable videos (due to network issues for instance).
However, if a lesson video is eventually unreachable, the script logs a warning and goes on with the next videos.
In that case, you could still re-run the script with the same parameters and only the unreachable videos will be downloaded again.

## In progress...

This is a beta version and although it works, some better error handling will be done shortly.
It has been tested with the latest LinkedIn Learning design change of early 2020, though.

In a near future, you can expect the following features :
- [x] Specifying course list from a LinkedIn Collection or Path
- [ ] CLI version with multiple commands using a csv file instead of params.json
- [ ] Optional download of transcripts
- [ ] Optional download of exercise files

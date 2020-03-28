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

- Fill in your credentials
- Provide an array of short course name such as "react-essential-training" if the course URL is  https://www.linkedin.com/learning/react-essential-training

```json
{
    "user": "your@email.com",
    "password": "yourpassword",
    "courses": [
        "final-cut-pro-x-10-4-4-essential-training",
        "react-essential-training"
    ],
    "outputFolder": "./courses/"
}
```

### Run to download courses

```sh
$ node ./index.js
```

If one of the courses or one of the courses' lessons already exists in the output path, it is not re-downloaded.

## In progress...

This is a beta version and although it works, some better error handling will be done shortly.
It has been tested with the latest LinkedIn Learning design change of early 2020, though.

In a near future, you can expect the following features :
- Optional download of transcripts
- Optional download of exercise files
- Specifying course list from a LinkedIn Collection or Path
- CLI version with multiple commands using a csv file instead of params.json
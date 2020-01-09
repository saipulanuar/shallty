const Browser = require('../Browser')
const Util = require('../utils/utils')
const Handler = require('../exceptions/Handler')
const {
    samehadaku_url,
    samehadaku_magBoxContainer
} = require('../config.json')

class Samehadaku {
    /**
     * Parse and get episode information from a post element handler.
     * @param post post element handler.
     */
    async parsePostElement(post) {
        const { title, postLink } = await post.$eval('a', node => ({
            title: node.innerText, 
            postLink: node.href
        }))
        if (!postLink.match(/(opening)/) && !postLink.match(/(ending)/)) {
            // const matches = postLink.match(/(?<=episode-)(\d+)(?=-subtitle-indonesia)/)
            const matches = postLink.match(/(?<=episode-)(\d+)/)
            if (matches && matches != null) {
                const numeral = matches[0].length == 1 ? '0' + matches[0] : matches[0]

                return {
                    episode: numeral,
                    title: title,
                    link: postLink
                }
            }
        }

        return null
    }

    /**
     * Parse and get episodes from a category/label page.
     * @param link category/label page.
     */
    async getEpisodes(link) {
        let totalPage
        const pageLimit = 3
        const episodes = []
        const page = await Browser.newOptimizedPage()

        try {
            link = decodeURIComponent(link)
            await page.goto(link)

            try {
                await page.waitForSelector('#content > div > div > div.pages-nav')
                const pageNav = await page.$('#content > div > div > div.pages-nav')
                let lastPage = await pageNav.$('li.last-page')
                if (!lastPage) {
                    lastPage = await pageNav.$$('li:not([class="the-next-page"])')
                    lastPage = lastPage[lastPage.length - 1]
                }
                const lastPageLink = await lastPage.$eval('a', node => node.href)
                totalPage = lastPageLink.replace(/\/+$/, '').split('/')
                totalPage = parseInt(totalPage[totalPage.length - 1])
                totalPage = totalPage > pageLimit ? pageLimit : totalPage
            } catch (error) {
                Handler.error(error)
                totalPage = 1
            }
            
            
            const postContainer = await page.$('ul#posts-container')
            const posts = await postContainer.$$('h3.post-title')
            await Util.asyncForEach(posts, async post => {
                const parsedEpisode = await this.parsePostElement(post)
                if (parsedEpisode)
                    episodes.push(parsedEpisode)
            })

            for (let i = 2; i <= totalPage; i++) {
                await page.goto(link.replace(/\/+$/, '') + `/page/${i}`)
                await page.waitForSelector('ul#posts-container')
                const postContainer = await page.$('ul#posts-container')
                const posts = await postContainer.$$('h3.post-title')
                await Util.asyncForEach(posts, async post => {
                    const parsedEpisode = await this.parsePostElement(post)
                    if (parsedEpisode)
                        episodes.push(parsedEpisode)
                })
            }

            await page.close()

            return episodes
        } catch (error) {
            await page.close()

            return Handler.error(error)
        }
    }

    /**
     * Get all title from on going page.
     */
    async checkOnGoingPage() {
        const anime = []
        const page = await Browser.newOptimizedPage()

        try {
            await page.goto(samehadaku_url)
            
            await page.waitForSelector('.mag-box-container')
            const magBoxContainer = await page.$$('.mag-box-container')
            const container = magBoxContainer[samehadaku_magBoxContainer]
            const posts = await container.$$('li[class="post-item  tie-standard"]')

            await Util.asyncForEach(posts, async (post) => {
                const titleHeader = await post.$('h3.post-title')
                const { title, link } = await titleHeader.$eval('a', node => ({
                    title: node.innerText,
                    link: node.href
                }))
                const parsedTitle = title.split(' Episode')[0]
                // const matches = link.match(/(?<=episode-)(\d+)(?=-subtitle-indonesia)/)
                const matches = link.match(/(?<=episode-)(\d+)/)
                if (matches && matches != null) {
                    const numeral = matches[0].length == 1 ? '0' + matches[0] : matches[0]

                    anime.push({
                        episode: numeral,
                        title: parsedTitle,
                        link: link
                    })
                }
            })

            await page.close()

            return anime
        } catch (error) {
            await page.close()

            return Handler.error(error)
        }
    }

    /**
     * Parse download links from episode page of a title.
     * @param link episode page.
     */
    async links(link) {
        const page = await Browser.newOptimizedPage()
        const downloadLinks = []

        try {
            link = decodeURIComponent(link)
            await page.goto(samehadaku_url + link)
            
            await page.waitForSelector('div.download-eps')
            const downloadDivs = await page.$$('div.download-eps')
            await Util.asyncForEach(downloadDivs, async downloadDiv => {
                const p = await page.evaluateHandle(node => node.previousElementSibling, downloadDiv)
                let format = await Browser.getPlainProperty(p, 'innerText')
                format = format.replace('</b>', '')
                    .replace('</b>', '')
                    .replace(/(&amp;)/, '')

                if (format.match(/(3gp)/i)) {
                    return false
                } else if (format.match(/(MKV)/i)) {
                    format = 'MKV'
                } else if (format.match(/(265)/i)) {
                    format = 'x265'
                } else if (format.match(/(MP4)/i)) {
                    format = 'MP4'
                }

                const list = await downloadDiv.$$('li')
                await Util.asyncForEach(list, async item => {
                    const strong = await item.$('strong')
                    if (strong && strong != null) {
                        const quality = await Browser.getPlainProperty(strong, 'innerText')
                        const anchors = await item.$$('a')
                        await Util.asyncForEach(anchors, async anchor => {
                            const host = await Browser.getPlainProperty(anchor, 'innerText')
                            const link = await Browser.getPlainProperty(anchor, 'href')

                            downloadLinks.push({
                                quality: `${format} ${quality}`,
                                host: host,
                                link: link
                            })
                        })
                    }
                })
            })

            await page.close()

            return downloadLinks
        } catch (error) {
            await page.close()

            return Handler.error(error)
        }
    }
}

module.exports = new Samehadaku
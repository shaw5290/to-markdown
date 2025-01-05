const fs = require('fs')
const path = require('path')
const AdmZip = require('adm-zip-iconv')
const { isMap } = require('util/types')

/**
 * 导出配置
 */
const exportConfig = {
  uploadFiles: false, //是否上传文件：图片、附件
  referenceDocJumpType: '.md', //引用文档跳转类型： .md | .html | null
  // referenceDocJumpType: '.html'
}

let isMultipleSheet = false

/**
 * 解压文件到指定目录
 * @param {待解压的文件} filepath
 * @param {指定解压的目录} target
 */
function unzip(filepath, target) {
  const zip = new AdmZip(filepath, 'gbk')
  // 检查目标解压目录是否存在，如果不存在，则创建
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true })
  }

  // 解压缩zip文件到目标目录
  zip.extractAllTo(target, /*overwrite*/ true)
  console.log(`文件${filepath}已解压缩到目标目录:${target}`)
}

const idMap = new Map([])
function addIdMap(node, rootId) {
  if (!node) {
    return
  }
  idMap.set(node.id, { ...node, children: undefined, rootId })
  if (
    node.children &&
    node.children.attached &&
    node.children.attached.length > 0
  ) {
    let children = node.children.attached
    for (let child of children) {
      addIdMap(child, rootId)
    }
  }
}
function toMarkdown(filename, xmindDir) {
  let files = fs.readdirSync(xmindDir)
  for (let file of files) {
    let absfile = path.join(xmindDir, file)
    // let tempFD = fs.openSync(file)
    if (fs.statSync(absfile).isDirectory()) {
      //暂时不处理
      continue
    } else {
      if (file === 'content.json') {
        let buffer = fs.readFileSync(absfile)
        let contentJsonArray = JSON.parse(buffer.toString('utf8'))
        isMultipleSheet = contentJsonArray.length > 1
        if (isMultipleSheet) {
          fs.mkdirSync(filename, { recursive: true })
        }

        for (let contentJson of contentJsonArray) {
          let root = contentJson.rootTopic
          idMap.set(root.id, { ...root, children: undefined, rootId: root.id })
          addIdMap(root, root.id)
        }
        // console.log(
        //   JSON.stringify(Array.from(idMap, ([key, value]) => ({ key, value })))
        // )

        for (let contentJson of contentJsonArray) {
          let root = contentJson.rootTopic
          let fd
          if (isMultipleSheet) {
            //TODO：TOC目录
            // fd = fs.openSync(`${filename}/${filename}.md`, 'w+')
            fd = fs.openSync(`${filename}/${root.title}.md`, 'w+')
          } else {
            fd = fs.openSync(`${filename}.md`, 'w+')
          }
          let context = {
            name: filename,
            baseDir: xmindDir,
            fd: fd,
          }
          traverse(context, root, 1)
          fs.closeSync(fd)
        }
      }
    }
  }
  console.log('转换完成')
}
function myWrite(context, content) {
  fs.writeFileSync(context.fd, content)
}
/**
 * 递归遍历节点
 */
function traverse(context, node, level) {
  if (!node) {
    return
  }

  // console.log('ThisLineNode', useNode)
  const TPYE = {
    CODE: '```',
  }
  let str = node.title?.trim()
  //代码块
  if (str && str.startsWith(TPYE.CODE) && str.endsWith(TPYE.CODE)) {
    let title = `${node.title}\n`
    console.log(title)
    console.error(str, TPYE.CODE, title)
    myWrite(context, title)
  } else if (node.title && level <= 6) {
    let prefix = signMultiplication('#', level)
    let title = `${prefix} ${node.title}\n`
    // href 引用跳转
    if (node.href && node.href.startsWith('xmind:')) {
      let id = node.href.slice(node.href.lastIndexOf('#') + 1)
      let useNode = idMap.get(id)
      let useNodeRoot = idMap.get(useNode?.rootId)
      // console.log('node.href uesId=', useNode)
      const anchorPoint = (str) => {
        if (
          exportConfig.referenceDocJumpType === '.html' ||
          !exportConfig.referenceDocJumpType
        ) {
          str = `/#${node.title}`
          return str
        }
        return ''
      }
      let content = `[${useNodeRoot ? useNodeRoot.title : node.title}](./${
        useNodeRoot ? useNodeRoot.title : node.title
      }${exportConfig.referenceDocJumpType}${anchorPoint(title)})\n`
      title = level <= 6 ? `${prefix} ${content}` : content
    }
    console.log(title)
    myWrite(context, title)
  }

  //图片
  if (node.image) {
    let src = node.image.src.slice(4)
    let imageTitle = node.title || 'default'
    let imageDir = !isMultipleSheet
      ? `${context.name}.attachment`
      : `${context.name}/attachment`
    let imageName = src.slice(src.lastIndexOf('/') + 1)
    let newImageSrc = `${imageDir}/${imageName}`
    if (exportConfig.uploadFiles) {
      //TODO：待上传文件
      newImageSrc = 'https://domain.com/a68fc5005269440c8b7450d698af2a07.png'
    } else {
      if (!fs.existsSync(imageDir)) {
        fs.mkdirSync(imageDir, { recursive: true })
      }
      let realSrc = path.join(context.baseDir, src)
      if (!fs.existsSync(newImageSrc)) {
        fs.copyFileSync(realSrc, newImageSrc)
      }
    }
    let content = `![${imageTitle}](${newImageSrc})\n`
    console.log(content)
    myWrite(context, content)
  }
  //笔记
  if (node.notes && node.notes.plain.content) {
    let content = `${node.notes.plain.content}\n`
    console.log(content)
    myWrite(context, content)
  }
  // href 附件
  if (node.href && !node.href.startsWith('xmind:')) {
    let src = node.href.slice(4)
    let imageTitle = node.title || 'default'
    let imageDir = !isMultipleSheet
      ? `${context.name}.attachment`
      : `${context.name}/attachment`
    let imageName = src.slice(src.lastIndexOf('/') + 1)
    let newImageSrc = `${imageDir}/${imageName}`
    if (exportConfig.uploadFiles) {
      //TODO：待上传文件
      newImageSrc = 'https://domain.com/xdssrfafdafasfdasfas.zip'
    } else {
      if (!fs.existsSync(imageDir)) {
        fs.mkdirSync(imageDir, { recursive: true })
      }
      let realSrc = path.join(context.baseDir, src)
      if (!fs.existsSync(newImageSrc)) {
        fs.copyFileSync(realSrc, newImageSrc)
      }
    }
    let content = `[${imageTitle}](${newImageSrc})\n`
    // console.log(content)
    myWrite(context, content)
  }

  if (
    node.children &&
    node.children.attached &&
    node.children.attached.length > 0
  ) {
    let children = node.children.attached
    for (let child of children) {
      traverse(context, child, level + 1)
    }
  }
}

/**
 * 符号乘法
 */
function signMultiplication(sign, n) {
  let result = ''
  for (let i = 0; i < n; i++) {
    result += sign
  }
  return result
}

function entry() {
  let filepath = findOption('-f')
  let filename = filepath.split(path.sep).pop()
  filename = filename.replace('.xmind', '')
  const extractToPath = 'extracted/'
  if (!fs.existsSync(filepath)) {
    console.error(`未找到${filepath}文件`)
  }
  if (fs.existsSync(extractToPath)) {
    fs.rmSync(extractToPath, { force: true, recursive: true })
  }
  unzip(filepath, extractToPath)
  toMarkdown(filename, extractToPath)
  fs.rmSync(extractToPath, { force: true, recursive: true })
}

function findOption(option) {
  let args = process.argv
  const i = args.findIndex((value, _index, _arr) => option === value)
  if (i > args.length - 2) {
    console.err('usage: node xmind.cjs -f xxxx.xmind')
    return
  }
  return args[i + 1]
}
entry()

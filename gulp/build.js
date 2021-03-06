'use strict';

var _ = require('underscore.string'),
    gulp = require('gulp'),
    path = require('path'),
    $ = require('gulp-load-plugins')({
        pattern: [
            'del',
            'gulp-*',
            'main-bower-files',
            'nib',
            'streamqueue',
            'uglify-save-license',
            'wiredep',
            'yargs'
        ]
    })

, buildConfig = require('../build.config.js'), appBase = buildConfig.appDir, appFontFiles = path.join(appBase, 'fonts/**/*'), appImages = path.join(appBase, 'images/**/*'), appMarkupFiles = path.join(appBase, '**/*.{haml,html,jade}'), appScriptFiles = path.join(appBase, '**/*.{ts,coffee,js}'), appStyleFiles = path.join(appBase, '**/*.{css,less,scss,styl}')

, isProd = $.yargs.argv.stage === 'prod'


, appTmplFiles = path.join(appBase, '**/*.tpl.html')


, tsProject = $.typescript.createProject({
    declarationFiles: true,
    noExternalResolve: false
});

// delete build directory
gulp.task('clean', function(cb) {
    return $.del(buildConfig.buildDir, cb);
});

// compile markup files and copy into build directory
gulp.task('markup', ['clean'], function() {
    var hamlFilter = $.filter('**/*.haml'),
        jadeFilter = $.filter('**/*.jade');

    return gulp.src([
            appMarkupFiles
        ])
        .pipe(hamlFilter)
        .pipe($.haml())
        .pipe(hamlFilter.restore())
        .pipe(jadeFilter)
        .pipe($.jade())
        .pipe(jadeFilter.restore())
        .pipe(gulp.dest(buildConfig.buildDir));
});

// compile styles and copy into build directory
gulp.task('styles', ['clean'], function() {
    var lessFilter = $.filter('**/*.less'),
        scssFilter = $.filter('**/*.scss'),
        stylusFilter = $.filter('**/*.styl'),
        onError = function(err) {
            $.notify.onError({
                title: 'Error linting at ' + err.plugin,
                subtitle: ' ', //overrides defaults
                message: err.message.replace(/\u001b\[.*?m/g, ''),
                sound: ' ' //overrides defaults
            })(err);

            // this.emit('end');
        };

    return gulp.src([
            appStyleFiles
        ])
        .pipe($.plumber({
            errorHandler: onError
        }))
        // .pipe(lessFilter)
        // .pipe($.less())
        // .pipe(lessFilter.restore())
        .pipe(scssFilter)
        .pipe($.sass())
        .pipe(scssFilter.restore())
        // .pipe(stylusFilter)
        // .pipe($.stylus({
        //     use: $.nib()
        // }))
        // .pipe(stylusFilter.restore())
        .pipe($.autoprefixer())
        .pipe($.if(isProd, $.cssRebaseUrls()))
        .pipe($.if(isProd, $.modifyCssUrls({
            modify: function(url) {
                // determine if url is using http, https, or data protocol
                // cssRebaseUrls rebases these URLs, too, so we need to fix that
                var beginUrl = url.indexOf('http:');
                if (beginUrl < 0) {
                    beginUrl = url.indexOf('https:');
                }
                if (beginUrl < 0) {
                    beginUrl = url.indexOf('data:');
                }

                if (beginUrl > -1) {
                    return url.substring(beginUrl, url.length);
                }

                // prepend all other urls
                return '../' + url;
            }
        })))
        .pipe($.if(isProd, $.concat('app.css')))
        .pipe($.if(isProd, $.cssmin()))
        .pipe($.if(isProd, $.rev()))
        .pipe(gulp.dest(buildConfig.buildCss));
});


// gulp.task('html2js', function() {
//     return gulp.src(appTmplFiles)
//         .pipe($.ngHtml2js({
//             moduleName: "templates-app"
//         }))
//         .pipe($.concat('templates.js'))
//         .pipe(gulp.dest(buildConfig.buildJs))
        
// });

// compile scripts and copy into build directory
gulp.task('scripts', ['clean', 'analyze', 'markup'], function() {
    var typescriptFilter = $.filter('**/*.ts'),
        coffeeFilter = $.filter('**/*.coffee'),
        htmlFilter = $.filter('**/*.html'),
        jsFilter = $.filter('**/*.js');

    return gulp.src([
            appScriptFiles,
            buildConfig.buildDir + '**/*.html',
            '!**/*_test.*',
            '!**/index.html'
        ])
        .pipe(typescriptFilter)
        .pipe($.typescript(tsProject))
        .pipe(typescriptFilter.restore())
        .pipe(coffeeFilter)
        .pipe($.coffee())
        .pipe(coffeeFilter.restore())
        .pipe($.if(isProd, htmlFilter))
        .pipe($.if(isProd, $.ngHtml2js({
            // lower camel case all app names
            moduleName: _.camelize(_.slugify(_.humanize(require('../package.json').name))),
            declareModule: false
        })))
        .pipe($.if(isProd, htmlFilter.restore()))
        .pipe(jsFilter)
        .pipe($.if(isProd, $.angularFilesort()))
        .pipe($.if(isProd, $.concat('app.js')))
        .pipe($.if(isProd, $.ngAnnotate()))
        .pipe($.if(isProd, $.uglify()))
        .pipe($.if(isProd, $.rev()))
        .pipe(gulp.dest(buildConfig.buildJs))
        .pipe(jsFilter.restore());
});

// inject custom CSS and JavaScript into index.html
gulp.task('inject', ['markup', 'styles', 'scripts'], function() {
    var jsFilter = $.filter('**/*.js');

    return gulp.src(buildConfig.buildDir + 'index.html')
        .pipe($.inject(gulp.src([
                buildConfig.buildCss + '**/*',
                buildConfig.buildJs + '**/*'
            ])
            .pipe(jsFilter)
            .pipe($.angularFilesort())
            .pipe(jsFilter.restore()), {
                addRootSlash: false,
                ignorePath: buildConfig.buildDir
            }))
        .pipe(gulp.dest(buildConfig.buildDir));
});

// copy bower components into build directory
gulp.task('bowerCopy', ['inject'], function() {
    var cssFilter = $.filter('**/*.css'),
        jsFilter = $.filter('**/*.js')

    , stream = $.streamqueue({
        objectMode: true
    }), wiredep = $.wiredep();

    if (wiredep.js) {
        stream.queue(gulp.src(wiredep.js));
    }

    if (wiredep.css) {
        stream.queue(gulp.src(wiredep.css));
    }

    return stream.done()
        .pipe(cssFilter)
        .pipe($.if(isProd, $.concat('vendor.css')))
        .pipe($.if(isProd, $.cssmin()))
        .pipe($.if(isProd, $.rev()))
        .pipe(gulp.dest(buildConfig.extCss))
        .pipe(cssFilter.restore())
        .pipe(jsFilter)
        .pipe($.if(isProd, $.concat('vendor.js')))
        .pipe($.if(isProd, $.uglify({
            preserveComments: $.uglifySaveLicense
        })))
        .pipe($.if(isProd, $.rev()))
        .pipe(gulp.dest(buildConfig.extJs))
        .pipe(jsFilter.restore());
});

// inject bower components into index.html
gulp.task('bowerInject', ['bowerCopy'], function() {
    if (isProd) {
        return gulp.src(buildConfig.buildDir + 'index.html')
            .pipe($.inject(gulp.src([
                buildConfig.extCss + 'vendor*.css',
                buildConfig.extJs + 'vendor*.js'
            ], {
                read: false
            }), {
                starttag: '<!-- bower:{{ext}} -->',
                endtag: '<!-- endbower -->',
                addRootSlash: false,
                ignorePath: buildConfig.buildDir
            }))
            .pipe($.htmlmin({
                collapseWhitespace: true,
                removeComments: true
            }))
            .pipe(gulp.dest(buildConfig.buildDir));
    } else {
        return gulp.src(buildConfig.buildDir + 'index.html')
            .pipe($.wiredep.stream({
                fileTypes: {
                    html: {
                        replace: {
                            css: function(filePath) {
                                return '<link rel="stylesheet" href="' + buildConfig.extCss.replace(buildConfig.buildDir, '') +
                                    filePath.split('/').pop() + '">';
                            },
                            js: function(filePath) {
                                return '<script src="' + buildConfig.extJs.replace(buildConfig.buildDir, '') +
                                    filePath.split('/').pop() + '"></script>';
                            }
                        }
                    }
                }
            }))
            .pipe(gulp.dest(buildConfig.buildDir));
    }
});

// copy custom fonts into build directory
gulp.task('fonts', ['fontsBower'], function() {
    var fontFilter = $.filter('**/*.{eot,otf,svg,ttf,woff}');
    return gulp.src([appFontFiles])
        .pipe(fontFilter)
        .pipe(gulp.dest(buildConfig.buildFonts))
        .pipe(fontFilter.restore());
});
// copy Bower fonts into build directory
gulp.task('fontsBower', ['clean'], function() {
    var fontFilter = $.filter('**/*.{eot,otf,svg,ttf,woff}');
    return gulp.src($.mainBowerFiles())
        .pipe(fontFilter)
        .pipe(gulp.dest(buildConfig.extFonts))
        .pipe(fontFilter.restore());
});

// copy and optimize images into build directory
gulp.task('images', ['clean'], function() {
    return gulp.src(appImages)
        .pipe($.if(isProd, $.imagemin()))
        .pipe(gulp.dest(buildConfig.buildImages));
});

gulp.task('copyTemplates', ['bowerInject'], function() {
    // always copy templates to testBuild directory
    var buildDirectiveTemplateFiles = path.join(buildConfig.buildDir, '**/*directive.tpl.html'),
        testDirectiveTemplateDir = path.join(buildConfig.buildTestDir, 'templates'),
        stream = $.streamqueue({
            objectMode: true
        });

    stream.queue(gulp.src([buildDirectiveTemplateFiles]));

    return stream.done()
        .pipe(gulp.dest(testDirectiveTemplateDir));
});

gulp.task('deleteTemplates', ['copyTemplates'], function(cb) {
    // only delete templates in production
    // the templates are injected into the app during prod build
    if (!isProd) {
        return cb();
    }

    gulp.src([buildConfig.buildDir + '**/*.html'])
        .pipe(gulp.dest('tmp/' + buildConfig.buildDir))
        .on('end', function() {
            $.del([
                buildConfig.buildDir + '*',
                '!' + buildConfig.buildCss,
                '!' + buildConfig.buildFonts,
                '!' + buildConfig.buildImages,
                '!' + buildConfig.buildImages,
                '!' + buildConfig.buildJs,
                '!' + buildConfig.extDir,
                '!' + buildConfig.buildDir + 'index.html'
            ], {
                mark: true
            }, cb);
        });
});



gulp.task('build', ['deleteTemplates', 'images', 'fonts']);

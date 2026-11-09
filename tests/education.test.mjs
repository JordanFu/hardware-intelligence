import test from 'node:test';
import assert from 'node:assert/strict';
import {educationCategories,educationMatches} from '../site/education.js';
test('diversified companies do not imply an education topic',()=>{
 for(const title of ['华为手机发布','Amazon云服务扩展','科大讯飞汽车语音系统'])assert.deepEqual(educationCategories({title}),[]);
 assert.equal(educationMatches({title:'华为手机',companies:['华为']},'all','华为'),false);
});
test('product categories remain separate including Kindle Fire',()=>{
 assert.deepEqual(educationCategories({title:'儿童手表新功能'}),['watch']);
 assert.deepEqual(educationCategories({title:'讯飞词典笔扫描改进'}),['pen']);
 assert.deepEqual(educationCategories({title:'Kindle Kids新内容'}),['reader']);
 assert.deepEqual(educationCategories({title:'Kindle Fire平板'}),[]);
 assert.deepEqual(educationCategories({title:'DingTalk A1纪要工作流'}),['recorder']);
 assert.equal(educationMatches({title:'学习机新内容'},'pen'),false);
});
test('explicit evidence-backed scope and company aliases support generic job titles',()=>{
 const item={title:'内容质量工程师',company:'猿辅导（小猿）',educationCategories:['tablet']};
 assert.equal(educationMatches(item,'tablet','猿辅导（小猿）',[]),true);
 assert.equal(educationMatches(item,'tablet','华为',[]),false);
 assert.equal(educationMatches({title:'小猿学习机'},'tablet','猿辅导（小猿）',[{company:'猿辅导（小猿）',aliases:['小猿','猿辅导']}]),true);
});
